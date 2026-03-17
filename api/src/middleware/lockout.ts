import type { Request, Response, NextFunction } from "express";
import { redis } from "@hakwa/redis";
import {
  AUTH_LOCKOUT_MAX_ATTEMPTS,
  AUTH_LOCKOUT_DURATION_SECONDS,
} from "@hakwa/core";

const lockoutKey = (email: string) =>
  `auth:lockout:${email.toLowerCase().trim()}`;

/**
 * Check whether the given email is currently locked out.
 * Returns `{ locked: true, ttl }` if locked, `{ locked: false }` otherwise.
 */
export async function checkLockout(
  email: string,
): Promise<{ locked: false } | { locked: true; ttl: number }> {
  const count = await redis.get(lockoutKey(email));
  if (count !== null && parseInt(count, 10) >= AUTH_LOCKOUT_MAX_ATTEMPTS) {
    const ttl = await redis.ttl(lockoutKey(email));
    return { locked: true, ttl: Math.max(ttl, 0) };
  }
  return { locked: false };
}

/**
 * Increment the failed-attempt counter for the given email.
 * On the first attempt, sets the TTL to AUTH_LOCKOUT_DURATION_SECONDS.
 */
export async function recordFailedAttempt(email: string): Promise<void> {
  const key = lockoutKey(email);
  const count = await redis.incr(key);
  if (count === 1) {
    // Set expiry only on the first increment so the window resets cleanly
    await redis.expire(key, AUTH_LOCKOUT_DURATION_SECONDS);
  }
}

/**
 * Clear the lockout counter for the given email on successful sign-in.
 */
export async function clearLockout(email: string): Promise<void> {
  await redis.del(lockoutKey(email));
}

/**
 * Express middleware for `POST /api/auth/sign-in/email`.
 *
 * 1. Rejects immediately with 429 if the account is locked.
 * 2. Intercepts the downstream response to record failures or clear the
 *    counter, keeping lockout logic close to the network boundary.
 */
export async function lockoutSignInMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const body = req.body as unknown;
  const email =
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>)["email"] === "string"
      ? ((body as Record<string, unknown>)["email"] as string)
          .toLowerCase()
          .trim()
      : null;

  if (!email) {
    next();
    return;
  }

  const lockoutStatus = await checkLockout(email);
  if (lockoutStatus.locked) {
    res.status(429).json({
      code: "ACCOUNT_LOCKED",
      message:
        "Account temporarily locked due to repeated failed sign-in attempts.",
      retryAfter: lockoutStatus.ttl,
    });
    return;
  }

  // Intercept res.end so we can react to Better Auth's response status
  const originalEnd = res.end.bind(res) as typeof res.end;
  // @ts-expect-error — intentional monkey-patch to observe response status
  res.end = function (
    ...args: Parameters<typeof res.end>
  ): ReturnType<typeof res.end> {
    const statusCode = res.statusCode;
    if (statusCode === 401) {
      recordFailedAttempt(email).catch((err: unknown) => {
        console.error("[lockout] recordFailedAttempt failed", { err });
      });
    } else if (statusCode === 200) {
      clearLockout(email).catch((err: unknown) => {
        console.error("[lockout] clearLockout failed", { err });
      });
    }
    return originalEnd(...args);
  };

  next();
}
