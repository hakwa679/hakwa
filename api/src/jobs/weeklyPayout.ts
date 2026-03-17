import cron from "node-cron";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { payoutBatch } from "@hakwa/db/schema";
import { mondayWeekStartFor } from "@hakwa/core";
import { processBatch } from "@hakwa/workers";

export async function createOrGetBatch(weekStart: string): Promise<{
  id: string;
  status: string;
  weekStart: string;
  created: boolean;
}> {
  const [created] = await db
    .insert(payoutBatch)
    .values({ weekStart, status: "scheduled" })
    .onConflictDoNothing()
    .returning({
      id: payoutBatch.id,
      status: payoutBatch.status,
      weekStart: payoutBatch.weekStart,
    });

  if (created) {
    return {
      id: created.id,
      status: created.status,
      weekStart: created.weekStart,
      created: true,
    };
  }

  const [existing] = await db
    .select({
      id: payoutBatch.id,
      status: payoutBatch.status,
      weekStart: payoutBatch.weekStart,
    })
    .from(payoutBatch)
    .where(eq(payoutBatch.weekStart, weekStart))
    .limit(1);

  if (!existing) {
    throw new Error("Unable to fetch existing payout batch after conflict");
  }

  return {
    id: existing.id,
    status: existing.status,
    weekStart: existing.weekStart,
    created: false,
  };
}

export async function runWeeklyPayoutCycle(now = new Date()): Promise<void> {
  const weekStart = mondayWeekStartFor(now);
  const batch = await createOrGetBatch(weekStart);
  await processBatch(batch.id);
}

export function registerWeeklyPayoutCron(): void {
  // Monday 00:00 Fiji (UTC+12) == Sunday 12:00 UTC.
  cron.schedule("0 12 * * 0", () => {
    runWeeklyPayoutCycle().catch((err: unknown) => {
      console.error("[cron] weekly payout job failed", { err });
    });
  });
}
