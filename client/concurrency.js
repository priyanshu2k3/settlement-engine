// concurrency.js

const CHECKOUT_URL = 'http://localhost:8000/api/orders/checkout';
const productId = 2;

async function checkout(userId) {
  const response = await fetch(CHECKOUT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      productId,
      quantity: 1,
    }),
  });

  const body = await response.text();

  return {
    userId,
    status: response.status,
    body,
  };
}

async function runTest() {
  console.log('Starting concurrency test...\n');

  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      checkout(index + 1)
    )
  );

  for (const result of results) {
    console.log(
      `User ${result.userId}: ${result.status}`,
      result.body
    );
  }

  const successful = results.filter(
    result => result.status === 201
  );

  const conflicts = results.filter(
    result => result.status === 409
  );

  console.log('\n----------------------------');
  console.log(`Total:     ${results.length}`);
  console.log(`Created:   ${successful.length}`);
  console.log(`Conflicts: ${conflicts.length}`);
  console.log('----------------------------');

  if (successful.length === 1 && conflicts.length === 19) {
    console.log('✅ Concurrency test passed');
  } else {
    console.log('❌ Concurrency test failed');
  }
}

runTest().catch(error => {
  console.error('Test failed:', error);
});