import type { NextFunction, Request, Response } from "express";
import { redis } from "../queue/queue.js";

export const idempotencyKey = "idempotencyKey";

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header("Idempotency-Key");
  if (!key) {
    res.status(400).json({ message: "Idempotency-Key header is required" });
    return;
  }

  const redisKey = `order:idemp:${key}`;
  const claimed = await redis.set(redisKey, "PROCESSING", "EX", 120, "NX");
  if (claimed === null) {
    const existing = await redis.get(redisKey);
    if (existing && existing !== "PROCESSING") {
      res.status(200).json(JSON.parse(existing) as Record<string, unknown>);
      return;
    }
    res.status(409).json({ message: "Request in progress" });
    return;
  }

  res.locals.idempotencyRedisKey = redisKey;
  res.locals[idempotencyKey] = key;
  next();
}
