import type { NextFunction, Request, Response } from "express";

type RequestMetric = { durationMs: number; statusCode: number; method: string; path: string };
const requestMetrics: RequestMetric[] = [];
const MAX_SAMPLES = 10_000;

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    requestMetrics.push({ durationMs, statusCode: res.statusCode, method: req.method, path: req.path });
    if (requestMetrics.length > MAX_SAMPLES) requestMetrics.shift();
  });
  next();
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))] ?? 0;
}

export function getRequestMetrics() {
  const durations = requestMetrics.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
  return {
    sampleCount: durations.length,
    p95Ms: Number(percentile(durations, 95).toFixed(2)),
    p99Ms: Number(percentile(durations, 99).toFixed(2)),
    averageMs: durations.length
      ? Number((durations.reduce((total, value) => total + value, 0) / durations.length).toFixed(2))
      : 0,
  };
}
