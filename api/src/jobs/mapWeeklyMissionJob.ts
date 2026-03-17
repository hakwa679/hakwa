import cron from "node-cron";
import db from "@hakwa/db";
import { mapMission } from "@hakwa/db/schema";
import { MAP_MISSIONS_PER_WEEK } from "@hakwa/core";
import { and, gte, lt } from "drizzle-orm";
import { MAP_MISSION_TEMPLATES } from "./missionTemplates.ts";

function startOfWeekUtc(date = new Date()): Date {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + offset);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

export async function runMapWeeklyMissionJob(
  now = new Date(),
): Promise<number> {
  const weekStart = startOfWeekUtc(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const existing = await db
    .select({ id: mapMission.id })
    .from(mapMission)
    .where(
      and(
        gte(mapMission.weekStart, weekStart),
        lt(mapMission.weekStart, weekEnd),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return 0;
  }

  const templates = MAP_MISSION_TEMPLATES.slice(0, MAP_MISSIONS_PER_WEEK);
  if (templates.length === 0) {
    return 0;
  }

  await db.insert(mapMission).values(
    templates.map((template) => ({
      weekStart,
      deadline: weekEnd,
      actionType: template.actionType,
      targetCount: template.targetCount,
    })),
  );

  return templates.length;
}

export function registerMapWeeklyMissionCron(): void {
  // Monday 00:10 UTC.
  cron.schedule("10 0 * * 1", () => {
    runMapWeeklyMissionJob().catch((error: unknown) => {
      console.error("[cron] map weekly mission job failed", { error });
    });
  });
}
