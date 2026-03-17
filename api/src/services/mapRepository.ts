import db from "@hakwa/db";
import {
  mapContributorStats,
  mapFeature,
  mapFeatureReport,
  mapMission,
  mapMissionProgress,
  mapModerationLog,
  mapVerification,
  type NewMapFeature,
  type NewMapFeatureReport,
  type NewMapVerification,
} from "@hakwa/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export async function createMapFeature(input: NewMapFeature) {
  const [created] = await db.insert(mapFeature).values(input).returning();
  return created;
}

export async function getMapFeatureById(featureId: string) {
  const rows = await db
    .select()
    .from(mapFeature)
    .where(eq(mapFeature.id, featureId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPendingMapFeatures(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  limit?: number;
  offset?: number;
}) {
  const rows = await db
    .select()
    .from(mapFeature)
    .where(
      and(
        eq(mapFeature.status, "pending"),
        sql`${mapFeature.lat}::numeric BETWEEN ${params.minLat} AND ${params.maxLat}`,
        sql`${mapFeature.lng}::numeric BETWEEN ${params.minLng} AND ${params.maxLng}`,
      ),
    )
    .orderBy(asc(mapFeature.createdAt))
    .limit(params.limit ?? 20)
    .offset(params.offset ?? 0);

  return rows;
}

export async function createVerification(input: NewMapVerification) {
  const [created] = await db.insert(mapVerification).values(input).returning();
  return created;
}

export async function createFeatureReport(input: NewMapFeatureReport) {
  const [created] = await db.insert(mapFeatureReport).values(input).returning();
  return created;
}

export async function ensureContributorStats(userId: string) {
  const [existing] = await db
    .select()
    .from(mapContributorStats)
    .where(eq(mapContributorStats.userId, userId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(mapContributorStats)
    .values({ userId })
    .returning();

  return created;
}

export async function listCurrentWeekMissions(weekStart: Date) {
  return db
    .select()
    .from(mapMission)
    .where(eq(mapMission.weekStart, weekStart));
}

export async function getMissionProgress(missionId: string, userId: string) {
  const rows = await db
    .select()
    .from(mapMissionProgress)
    .where(
      and(
        eq(mapMissionProgress.missionId, missionId),
        eq(mapMissionProgress.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function writeModerationLog(input: {
  featureId: string | null;
  moderatorId: string;
  action: "approve" | "reject" | "warn_contributor" | "ban_contributor";
  reason?: string;
  detailsJson?: string;
}) {
  const [created] = await db.insert(mapModerationLog).values(input).returning();
  return created;
}

export async function withMapTransaction<T>(
  fn: (tx: unknown) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
