import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { REDIS_HOST, REDIS_PORT } from "../config.js";

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
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
