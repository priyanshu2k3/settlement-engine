/**
 * Handles purchase checkout within an ACID transaction.
 * 
 * @param {PoolClient} client - Dedicated PostgreSQL client checked out from the pool
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.productId
 * @param {number} params.quantity
 */
import type { PoolClient } from 'pg';

interface CheckoutParams {
  userId: string;
  productId: string;
  quantity: number;
  idempotencyKey: string;
}

interface CheckoutResult {
  status: number;
  message?: string;
  data?: {
    orderId: number;
    debitedCents: number;
    remainingBalanceCents: number;
    remainingStock: number;
  };
}

interface ProductRow {
  id: number;
  price_cents: number;
  stock_quantity: number;
}

interface WalletRow {
  user_id: number;
  balance_cents: number;
}

// function freezeApp(ms:number) {
//   const buffer = new Int32Array(new SharedArrayBuffer(4));
//   Atomics.wait(buffer, 0, 0, ms);
// }freezeApp(2000);
export async function Checkout(
  client: PoolClient,
  { userId, productId, quantity, idempotencyKey }: CheckoutParams,
): Promise<CheckoutResult> {
  try {
    await client.query('BEGIN');

    // 1. Fetch & lock product inventory first to avoid deadlocks across concurrent orders
    const productResult = await client.query(
      `SELECT id, price_cents, stock_quantity 
       FROM products 
       WHERE id = $1 
       FOR UPDATE`,
      [productId]
    );

    if (productResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 404, message: 'Product not found' };
    }

    const product = productResult.rows[0] as ProductRow | undefined;
    if (!product) {
      await client.query('ROLLBACK');
      return { status: 404, message: 'Product not found' };
    }

    // Check inventory condition
    if (product.stock_quantity < quantity) {
      await client.query('ROLLBACK');
      return { status: 409, message: 'Sold Out/Less quantity left' };
    }

    // 2. Fetch & lock the user's wallet 
    const walletResult = await client.query(
      `SELECT user_id, balance_cents 
       FROM wallets 
       WHERE user_id = $1 
       FOR UPDATE`,
      [userId]
    );

    if (walletResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 404, message: 'Wallet not found' };
    }

    const wallet = walletResult.rows[0] as WalletRow | undefined;
    if (!wallet) {
      await client.query('ROLLBACK');
      return { status: 404, message: 'Wallet not found' };
    }
    const totalCost = product.price_cents * quantity;

    // Check wallet balance condition
    if (wallet.balance_cents < totalCost) {
      await client.query('ROLLBACK');
      return { status: 402, message: 'Insufficient Funds' };
    }

    // 3. Decrement inventory
    await client.query(
      `UPDATE products 
       SET stock_quantity = stock_quantity - $1 
       WHERE id = $2`,
      [quantity, product.id]
    );

    // 4. Debit wallet
    await client.query(
      `UPDATE wallets 
       SET balance_cents = balance_cents - $1 
       WHERE user_id = $2`,
      [totalCost, wallet.user_id]
    );

    // 5. Create order record
 const orderResult = await client.query(
  `INSERT INTO orders (user_id, product_id, status, quantity, idempotency_key) 
   VALUES ($1, $2, 'COMPLETED', $3, $4) 
   RETURNING id`,
  [userId, product.id, quantity, idempotencyKey]
);
    const order = orderResult.rows[0] as { id: number } | undefined;
    if (!order) {
      throw new Error('Order insert did not return an id');
    }
    const orderId = order.id;

    // 6. Record balancing ledger entry (Double-entry / audit trail)
    await client.query(
      `INSERT INTO ledger_entries ( order_id,wallet_id, amount_cents, entry_type) 
       VALUES ($1, $2, $3, 'DEBIT')`,
      [orderId, wallet.user_id, totalCost]
    );

    // 7. Commit transaction
    await client.query('COMMIT');

    return {
      status: 201,
      data: {
        orderId,
        debitedCents: totalCost,
        remainingBalanceCents: wallet.balance_cents - totalCost,
        remainingStock: product.stock_quantity - quantity,
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
