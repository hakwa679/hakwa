import cron from "node-cron";
import { redis } from "@hakwa/redis";

export async function runWeeklyReviewMissionReset(
  now = new Date(),
): Promise<number> {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const weekPrefix = `${year}-${month}`;

  let cursor = "0";
  let deleted = 0;

  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "review-mission:week:*",
      "COUNT",
      200,
    );
    cursor = next;

    const stale = keys.filter((k) => !k.includes(weekPrefix));
    if (stale.length > 0) {
      deleted += await redis.del(...stale);
    }
  } while (cursor !== "0");

  return deleted;
}

export function registerWeeklyReviewMissionResetCron(): void {
  // Monday 00:00 Fiji ~ Sunday 12:00 UTC
  cron.schedule("0 12 * * 0", () => {
    runWeeklyReviewMissionReset().catch((error: unknown) => {
      console.error("[cron] weekly review mission reset failed", { error });
    });
  });
}
