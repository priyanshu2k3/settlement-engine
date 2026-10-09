import express, { type Express } from "express";
import cors from "cors";
import { PORT } from "./config.js";
export const app: Express = express();
import { Checkout } from "./db/query/queryCheckout.js";
import database from "./db/Database.js";
import { orderQueue } from "./queue/queue.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));
app.get("/", (req, res) => {
  res.json({ message: "server is working " });
});

app.get("/api/telemetry", async (_req, res) => {
  const counts = await orderQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
  );
  res.json(counts);
});

app.get("/api/state", async (_req, res) => {
  const result = await database.query(`
SELECT
  (SELECT COALESCE(json_agg(p), '[]') FROM (
    SELECT id, name, stock_quantity AS "stockQuantity", price_cents AS "priceCents"
    FROM products
  ) p) AS products,
  
  (SELECT COALESCE(json_agg(w), '[]') FROM (
    SELECT user_id AS "userId", balance_cents AS "balanceCents"
    FROM wallets
  ) w) AS wallets;
  `);
  res.json(result.rows[0]);
});

app.post("/api/simulate", async (req, res) => {
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  const productId = String(req.body?.productId ?? "1");
  if (userIds.length === 0) {
    res.status(400).json({ message: "Select at least one user" });
    return;
  }

  const jobs = (
    await Promise.all(
      userIds.flatMap((userId: unknown) =>
        Array.from({ length: Math.ceil(50 / userIds.length) }, (_, index) => {
          const idempotencyKey = `dashboard-${Date.now()}-${userId}-${index}`;
          return orderQueue.add(
            "checkout",
            {
              userId: String(userId),
              productId,
              quantity: 1,
              idempotencyKey,
              redisKey: `order:idemp:${idempotencyKey}`,
            },
            { jobId: idempotencyKey },
          );
        }),
      ),
    )
  ).slice(0, 50);

  res
    .status(202)
    .json({ submitted: jobs.length, jobIds: jobs.map((job) => job.id) });
});

app.post("/api/orders/checkout", idempotencyMiddleware, async (req, res) => {
  const { userId, productId, quantity } = req.body;
  if (!userId || !productId || !quantity) {
    return res.status(400).json({ message: "Please provide all details" });
  }
  const job = await orderQueue.add(
    "checkout",
    {
      userId,
      productId,
      quantity,
      idempotencyKey: res.locals.idempotencyKey as string,
      redisKey: res.locals.idempotencyRedisKey as string,
    },
    { jobId: res.locals.idempotencyKey as string },
  );
  res.status(202).json({
    status: 202,
    message: "Order accepted for processing",
    jobId: job.id,
  });
});

app.listen(PORT, () => {
  console.log(`StreamGrabber API listening on http://localhost:${PORT}`);
});
