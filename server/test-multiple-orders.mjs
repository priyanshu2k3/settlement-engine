const baseUrl = process.env.API_URL ?? "http://localhost:8000";
const userCount = Number(process.env.TEST_USERS ?? "10");
const mode = process.env.TEST_MODE ?? "same"; // same | different
const sameUserId = process.env.TEST_USER_ID ?? "10";
const sameProductId = process.env.TEST_PRODUCT_ID ?? "1";
const quantity = Number(process.env.TEST_QUANTITY ?? "1");

if (!Number.isInteger(userCount) || userCount < 1) {
  throw new Error("TEST_USERS must be a positive integer");
}
if (!["same", "different"].includes(mode)) {
  throw new Error('TEST_MODE must be "same" or "different"');
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

const requests = Array.from({ length: userCount }, (_, index) => {
  const userId = mode === "same" ? sameUserId : String(Number(sameUserId) + index);
  const productId = mode === "same" ? sameProductId : String(Number(sameProductId) + index);
  return {
    index: index + 1,
    userId,
    productId,
    quantity,
    idempotencyKey: `multi-worker-test-${mode}-${Date.now()}-${index + 1}`,
  };
});

console.log(`Submitting ${userCount} concurrent orders in ${mode} mode...`);

const results = await Promise.all(
  requests.map(async (request) => {
    try {
      const response = await fetch(`${baseUrl}/api/orders/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify({
          userId: request.userId,
          productId: request.productId,
          quantity: request.quantity,
        }),
      });

      return {
        ...request,
        status: response.status,
        body: await readJson(response),
      };
    } catch (error) {
      return { ...request, status: "ERROR", body: String(error) };
    }
  }),
);

for (const result of results) {
  console.log(
    `#${result.index} user=${result.userId} product=${result.productId} ` +
      `status=${result.status} body=${JSON.stringify(result.body)}`,
  );
}

const counts = results.reduce((summary, result) => {
  const key = String(result.status);
  summary[key] = (summary[key] ?? 0) + 1;
  return summary;
}, {});

console.log("Summary:", JSON.stringify(counts));
console.log("Job IDs:", results.map((result) => result.body.jobId).filter(Boolean));
