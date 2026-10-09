import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

export const orderQueue = new Queue("order-processing", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
  },
});

export const orderDlq = new Queue("order-processing-dlq", {
  connection: redis,
});
