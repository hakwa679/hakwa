import db from "@hakwa/db";
import { mapContributorTrust, mapFeature } from "@hakwa/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  MAP_GPS_MAX_VELOCITY_KM_H,
  MAP_TRUST_MIN_ACCEPTED_SENIOR,
  MAP_TRUST_MIN_ACCEPTED_TRUSTED,
} from "@hakwa/core";

export type ScreenOutcome = "pass" | "flag" | "auto_reject";
export type TrustTier = "standard" | "trusted" | "senior";

export interface ScreenResult {
  outcome: ScreenOutcome;
  reason?: string;
}

const BLOCKLIST = ["bomb", "kill", "hate", "terror"];

export async function assertNotMapBanned(userId: string): Promise<void> {
  const rows = await db
    .select()
    .from(mapContributorTrust)
    .where(eq(mapContributorTrust.userId, userId))
    .limit(1);

  const trust = rows[0];
  if (!trust?.isMapBanned) {
    return;
  }

  if (trust.banExpiresAt && trust.banExpiresAt < new Date()) {
    await db
      .update(mapContributorTrust)
      .set({ isMapBanned: false, banExpiresAt: null })
      .where(eq(mapContributorTrust.userId, userId));
    return;
  }

  throw new Error("MAP_USER_MAP_BANNED");
}

export async function getTrustTier(userId: string): Promise<TrustTier> {
  const rows = await db
    .select()
    .from(mapContributorTrust)
    .where(eq(mapContributorTrust.userId, userId))
    .limit(1);

  const trust = rows[0];
  if (!trust || trust.isMapBanned) {
    return "standard";
  }

  if (trust.acceptedContributions >= MAP_TRUST_MIN_ACCEPTED_SENIOR) {
    return "senior";
  }
  if (trust.acceptedContributions >= MAP_TRUST_MIN_ACCEPTED_TRUSTED) {
    return "trusted";
  }
  return "standard";
}

export function screenMapContent(input: {
  title?: string;
  description?: string;
  velocityKmH?: number;
}): ScreenResult {
  const haystack =
    `${input.title ?? ""} ${input.description ?? ""}`.toLowerCase();

  if (BLOCKLIST.some((token) => haystack.includes(token))) {
    return { outcome: "flag", reason: "blocked_keyword" };
  }

  if (
    typeof input.velocityKmH === "number" &&
    Number.isFinite(input.velocityKmH) &&
    input.velocityKmH > MAP_GPS_MAX_VELOCITY_KM_H
  ) {
    return { outcome: "flag", reason: "gps_velocity_flag" };
  }

  return { outcome: "pass" };
}

export async function getLastContributorFeature(userId: string): Promise<
  | {
      lat: number;
      lng: number;
      createdAt: Date;
    }
  | undefined
> {
  const rows = await db
    .select({
      lat: mapFeature.lat,
      lng: mapFeature.lng,
      createdAt: mapFeature.createdAt,
    })
    .from(mapFeature)
    .where(and(eq(mapFeature.contributorId, userId)))
    .orderBy(desc(mapFeature.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: row.createdAt,
  };
}
