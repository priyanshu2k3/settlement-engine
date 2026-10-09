import { Worker } from "bullmq";
import database from "./db/Database.js";
import { Checkout } from "./db/query/queryCheckout.js";
import { orderDlq, orderQueue, redis } from "./queue/queue.js";

interface OrderPayload {
  userId: string;
  productId: string;
  quantity: number;
  idempotencyKey: string;
  redisKey: string;
}

export const worker = new Worker<OrderPayload>(
  "order-processing",
  async (job) => {
    const client = await database.getClient();
    try {
      const result = await Checkout(client, job.data);
      await redis.set(job.data.redisKey, JSON.stringify(result), "EX", 120);
      return result;
    } finally {
      client.release();
    }
  },
  { connection: redis },
);

worker.on("failed", async (job, error) => {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  await orderDlq.add("failed-order", {
    ...job.data,
    error: error.message,
    originalJobId: job.id,
  });
  await redis.set(
    job.data.redisKey,
    JSON.stringify({ status: 500, message: "Order processing failed" }),
    "EX",
    120,
  );
});

worker.on("completed", (job) => {
  console.log(`Order job ${job.id} completed`);
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

worker.on("ready", async () => {
  console.log("Worker connected to Redis and ready");
  const counts = await orderQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  );
  console.log("Order queue counts:", counts);
});

console.log("Order-processing worker started");
