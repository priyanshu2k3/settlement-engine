const baseUrl = process.env.API_URL ?? "http://localhost:8000";
const userId = process.env.TEST_USER_ID ?? "1";
const productId = process.env.TEST_PRODUCT_ID ?? "5";
const quantity = Number(process.env.TEST_QUANTITY ?? "1");
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS ?? "15000");
const pollMs = 500;
const idempotencyKey = "abcde"|| `worker-test-${Date.now()}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

console.log(`Checking API: ${baseUrl}`);
const health = await fetch(`${baseUrl}/`);
if (!health.ok) {
  throw new Error(`API health check failed: ${health.status} ${JSON.stringify(await readJson(health))}`);
}
console.log(`Submitting checkout with key: ${idempotencyKey}`);

const submitted = await fetch(`${baseUrl}/api/orders/checkout`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  },
  body: JSON.stringify({ userId, productId, quantity }),
});

const submittedBody = await readJson(submitted);
if (submitted.status !== 202) {
  throw new Error(`Checkout was not queued: ${submitted.status} ${JSON.stringify(submittedBody)}`);
}

console.log(`Queued job: ${submittedBody.jobId}`);
console.log("Polling until the worker stores the result...");

const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline) {
  await sleep(pollMs);
  const result = await fetch(`${baseUrl}/api/orders/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ userId, productId, quantity }),
  });

  const body = await readJson(result);
  if (result.status === 409) continue;

  console.log(`Worker result: ${result.status} ${JSON.stringify(body)}`);
  if (result.status >= 200 && result.status < 300) {
    console.log("PASS: worker processed the queued job.");
    process.exit(0);
  }

  throw new Error("Worker returned a failure result.");
}

throw new Error(`Timed out after ${timeoutMs}ms. Confirm that npm run worker is running.`);
