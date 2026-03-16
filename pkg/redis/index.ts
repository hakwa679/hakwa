import { Redis } from "ioredis";

if (!process.env["REDIS_URL"]) {
  throw new Error("[redis] REDIS_URL environment variable is not set");
}

/**
 * Singleton Redis client.  All packages must import from here —
 * never instantiate their own Redis connections.
 */
export const redis = new Redis(process.env["REDIS_URL"]);

/**
 * A second Redis connection dedicated to blocking commands (XREAD, SUBSCRIBE,
 * BLPOP …). A single ioredis Client cannot interleave regular commands with
 * blocking ones, so callers that need blocking semantics must use this
 * dedicated client.
 */
export const redisSubscriber = new Redis(process.env["REDIS_URL"]);

redis.on("error", (err) => {
  console.error("[redis] connection error", { error: err.message });
});

redisSubscriber.on("error", (err) => {
  console.error("[redis:subscriber] connection error", { error: err.message });
});

export default redis;
