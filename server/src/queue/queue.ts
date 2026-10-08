import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

// Instantiate normally
export const testingFunction = (): void => {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  });
  console.log("Analyzing ioredis instance:", redis);
};
