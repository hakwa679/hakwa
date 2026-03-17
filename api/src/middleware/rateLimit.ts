import type { Request, Response, NextFunction } from "express";
import redis from "@hakwa/redis";

export function createRateLimit(options: {
  prefix: string;
  max: number;
  windowSeconds: number;
}) {
  return async function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const keySource =
      (req.headers["x-forwarded-for"] as string | undefined) ??
      req.ip ??
      "unknown";
    const key = `${options.prefix}:${keySource}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (count > options.max) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      });
      return;
    }

    next();
  };
}
