import { randomUUID } from "node:crypto";
import db from "@hakwa/db";
import {
  mapContributorStats,
  mapFeature,
  pointsAccount,
  pointsLedger,
  user,
  type NewMapFeature,
} from "@hakwa/db/schema";
import {
  MAP_DAILY_CONTRIBUTION_LIMIT,
  MAP_POINTS_CONTRIBUTION,
  MAP_POINTS_PHOTO_BONUS,
} from "@hakwa/core";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  assertNotMapBanned,
  getLastContributorFeature,
  screenMapContent,
} from "./mapSafetyService.ts";
import { validateMapSubmitInput } from "./mapValidationService.ts";
import { findNearbyPendingSameType } from "./mapQueryService.ts";
import { updateMissionProgressForAction } from "./mapMissionService.ts";

export interface SubmitMapContributionInput {
  featureType: "poi" | "road" | "landmark" | "hazard" | "pickup_spot" | "other";
  title?: string;
  description?: string;
  lat: number;
  lng: number;
  geometryJson: string;
  gpsAccuracyMeters?: number;
  photoUrl?: string;
}

export async function submitMapContribution(
  userId: string,
  input: SubmitMapContributionInput,
): Promise<{ id: string; status: string; warning?: string; createdAt: Date }> {
  await assertNotMapBanned(userId);

  const normalized = validateMapSubmitInput({
    lat: input.lat,
    lng: input.lng,
    ...(typeof input.gpsAccuracyMeters === "number"
      ? { gpsAccuracyMeters: input.gpsAccuracyMeters }
      : {}),
  });

  const dayStartUtc = new Date();
  dayStartUtc.setUTCHours(0, 0, 0, 0);

  const countRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mapFeature)
    .where(
      and(
        eq(mapFeature.contributorId, userId),
        gte(mapFeature.createdAt, dayStartUtc),
      ),
    )
    .limit(1);

  const count = countRow[0]?.count ?? 0;

  if (count >= MAP_DAILY_CONTRIBUTION_LIMIT) {
    throw new Error("MAP_DAILY_LIMIT_REACHED");
  }

  const previous = await getLastContributorFeature(userId);
  let velocityKmH: number | undefined;
  if (previous) {
    const elapsedMs = Date.now() - previous.createdAt.getTime();
    if (elapsedMs > 0) {
      const kmPerDeg = 111.32;
      const dLat = normalized.lat - previous.lat;
      const dLng = normalized.lng - previous.lng;
      const distanceKm = Math.sqrt(dLat * dLat + dLng * dLng) * kmPerDeg;
      velocityKmH = distanceKm / (elapsedMs / 3_600_000);
    }
  }

  const screening = screenMapContent({
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(typeof velocityKmH === "number" ? { velocityKmH } : {}),
  });

  const hasDuplicateWarning = await findNearbyPendingSameType({
    lat: normalized.lat,
    lng: normalized.lng,
    featureType: input.featureType,
  });

  const status = screening.outcome === "flag" ? "pending_review" : "pending";

  const created = await db.transaction(async (tx) => {
    const [createdFeature] = await tx
      .insert(mapFeature)
      .values({
        contributorId: userId,
        featureType: input.featureType,
        title: input.title,
        description: input.description,
        geometryJson: input.geometryJson,
        lat: normalized.lat.toString(),
        lng: normalized.lng.toString(),
        photoUrl: input.photoUrl,
        status,
        gpsVelocityFlag: screening.reason === "gps_velocity_flag",
      } as NewMapFeature)
      .returning();

    if (!createdFeature) {
      throw new Error("MAP_CREATE_FAILED");
    }

    await tx
      .insert(mapContributorStats)
      .values({ userId, contributionsCount: 1 })
      .onConflictDoUpdate({
        target: mapContributorStats.userId,
        set: {
          contributionsCount: sql`${mapContributorStats.contributionsCount} + 1`,
          updatedAt: new Date(),
        },
      });

    if (status === "pending") {
      const userRows = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      const actor = userRows[0]?.role === "driver" ? "operator" : "passenger";

      const referralCode = `MAP-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [account] = await tx
        .insert(pointsAccount)
        .values({
          userId,
          actor,
          referralCode,
          totalPoints:
            MAP_POINTS_CONTRIBUTION +
            (input.photoUrl ? MAP_POINTS_PHOTO_BONUS : 0),
        })
        .onConflictDoUpdate({
          target: pointsAccount.userId,
          set: {
            totalPoints: sql`${pointsAccount.totalPoints} + ${MAP_POINTS_CONTRIBUTION + (input.photoUrl ? MAP_POINTS_PHOTO_BONUS : 0)}`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: pointsAccount.id });

      const accountId = account?.id
        ? account.id
        : (
            await tx
              .select({ id: pointsAccount.id })
              .from(pointsAccount)
              .where(eq(pointsAccount.userId, userId))
              .limit(1)
          )[0]?.id;

      if (accountId) {
        await tx.insert(pointsLedger).values({
          accountId,
          amount: MAP_POINTS_CONTRIBUTION,
          sourceAction: "map_contribution",
          referenceId: createdFeature.id,
        });

        if (input.photoUrl) {
          await tx.insert(pointsLedger).values({
            accountId,
            amount: MAP_POINTS_PHOTO_BONUS,
            sourceAction: "map_photo_bonus",
            referenceId: createdFeature.id,
          });
        }
      }
    }

    return {
      id: createdFeature.id,
      status: createdFeature.status,
      ...(hasDuplicateWarning ? { warning: "similar_feature_nearby" } : {}),
      createdAt: createdFeature.createdAt,
    };
  });

  if (input.featureType === "poi") {
    await updateMissionProgressForAction({
      userId,
      actionType: "contribute_poi",
    });
  }

  if (input.photoUrl) {
    await updateMissionProgressForAction({
      userId,
      actionType: "contribute_with_photo",
    });
  }

  return created;
}
