import db from "@hakwa/db";
import { mapContributorStats, mapContributorTrust } from "@hakwa/db/schema";
import { eq } from "drizzle-orm";
import { getTrustTier } from "./mapSafetyService.ts";

export interface MapStatsResponse {
  contributionsCount: number;
  acceptedContributions: number;
  verificationCount: number;
  mapStreak: number;
  rideImpactCount: number;
  trustTier: "standard" | "trusted" | "senior";
  isMapBanned: boolean;
}

export async function getMyMapStats(userId: string): Promise<MapStatsResponse> {
  const [stats] = await db
    .select()
    .from(mapContributorStats)
    .where(eq(mapContributorStats.userId, userId))
    .limit(1);

  const trustTier = await getTrustTier(userId);
  const [trust] = await db
    .select({ isMapBanned: mapContributorTrust.isMapBanned })
    .from(mapContributorTrust)
    .where(eq(mapContributorTrust.userId, userId))
    .limit(1);

  return {
    contributionsCount: stats?.contributionsCount ?? 0,
    acceptedContributions: stats?.acceptedContributions ?? 0,
    verificationCount: stats?.verificationCount ?? 0,
    mapStreak: stats?.mapStreak ?? 0,
    rideImpactCount: stats?.rideImpactCount ?? 0,
    trustTier,
    isMapBanned: Boolean(trust?.isMapBanned),
  };
}
