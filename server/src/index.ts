import express, { type Express } from "express";
import cors from "cors";
import { PORT } from "./config.js";
export const app: Express = express();
import { Checkout } from "./db/query/queryCheckout.js";
import database from "./db/Database.js";
import { orderQueue, orderDlq, redis } from "./queue/queue.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import { getRequestMetrics, requestMetricsMiddleware } from "./middleware/metrics.js";

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(requestMetricsMiddleware);
app.get("/", (req, res) => {
  res.json({ message: "server is working " });
});

app.get("/metrics", async (_req, res) => {
  const [databaseHealth, redisHealth] = await Promise.allSettled([
    database.query("SELECT 1"),
    redis.info("memory"),
  ]);
  const redisInfo = redisHealth.status === "fulfilled"
    ? Object.fromEntries(redisHealth.value.split("\r\n").filter(Boolean).map((line) => {
        const [key, ...value] = line.split(":");
        return [key, value.join(":")];
      }))
    : null;
  const healthy = databaseHealth.status === "fulfilled" && redisHealth.status === "fulfilled";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptimeSeconds: Math.floor(process.uptime()),
    requests: getRequestMetrics(),
    database: {
      connected: databaseHealth.status === "fulfilled",
      pool: database.poolStats(),
    },
    redis: {
      connected: redisHealth.status === "fulfilled",
      memory: redisInfo
        ? { usedBytes: Number(redisInfo.used_memory ?? 0), peakBytes: Number(redisInfo.used_memory_peak ?? 0) }
        : null,
    },
  });
});

app.get("/health", async (_req, res) => {
  try {
    await Promise.all([database.query("SELECT 1"), redis.ping()]);
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
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

app.post("/api/orders/results", async (req, res) => {
  const keys = Array.isArray(req.body?.idempotencyKeys)
    ? [...new Set(req.body.idempotencyKeys.map(String).filter(Boolean))]
    : [];
  if (keys.length === 0) {
    res.status(400).json({ message: "At least one idempotency key is required" });
    return;
  }
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
  const result = await database.query(
    `SELECT id, user_id AS "userId", product_id AS "productId", status,
            quantity, idempotency_key AS "idempotencyKey"
     FROM orders
     WHERE idempotency_key IN (${placeholders})
     ORDER BY id`,
    keys,
  );
  const finalResults = await redis.mget(...keys.map((key) => `order:idemp:${key}`));
  const ordersByKey = new Map(result.rows.map((order) => [order.idempotencyKey, order]));
  res.json({
    results: keys.map((key, index) => {
      const order = ordersByKey.get(key);
      if (order) return { idempotencyKey: key, status: 201, completed: true, order };
      const stored = finalResults[index];
      if (stored) {
        try {
          return { idempotencyKey: key, completed: false, ...JSON.parse(stored) };
        } catch {
          return { idempotencyKey: key, completed: false, status: 500, message: "Invalid worker result" };
        }
      }
      return { idempotencyKey: key, completed: false, status: 102, message: "Still processing" };
    }),
  });
});

app.delete("/api/redis", async (_req, res) => {
  await orderQueue.obliterate({ force: true });
  await orderDlq.obliterate({ force: true });

  let cursor = "0";
  let deletedKeys = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "order:idemp:*", "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) deletedKeys += await redis.del(...keys);
  } while (cursor !== "0");

  res.json({ message: "Settlement-engine Redis data cleared", deletedKeys });
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
