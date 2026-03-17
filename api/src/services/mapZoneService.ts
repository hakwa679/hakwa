import db from "@hakwa/db";
import {
  mapContributorStats,
  mapFeature,
  mapZone,
  pointsAccount,
  pointsLedger,
} from "@hakwa/db/schema";
import { MAP_POINTS_PIONEER_BONUS } from "@hakwa/core";
import { and, eq, sql } from "drizzle-orm";
import { getZoneTopContributors } from "./mapQueryService.ts";
import { setZoneCompletionPercent } from "./mapRedisService.ts";

export interface ZoneUpdateResult {
  zoneId: string;
  percent: number;
  reached50: boolean;
  reached100: boolean;
  pioneerAwarded: boolean;
}

export async function updateZoneProgressOnFeatureActivation(input: {
  featureId: string;
  contributorId: string;
  zoneId?: string | null;
}): Promise<ZoneUpdateResult | null> {
  if (!input.zoneId) {
    return null;
  }

  const result = await db.transaction(async (tx) => {
    const [zone] = await tx
      .select()
      .from(mapZone)
      .where(eq(mapZone.id, input.zoneId as string))
      .limit(1);

    if (!zone) {
      return null;
    }

    const previousCount = zone.currentFeatureCount;
    const nextCount = previousCount + 1;
    const target = zone.targetFeatureCount > 0 ? zone.targetFeatureCount : 1;
    const percent = Math.min(
      100,
      Number(((nextCount / target) * 100).toFixed(2)),
    );

    let pioneerAwarded = false;
    const isFirstActivation = previousCount === 0;
    const shouldAssignPioneer = isFirstActivation && !zone.pioneerUserId;

    await tx
      .update(mapZone)
      .set({
        currentFeatureCount: nextCount,
        pioneerUserId: shouldAssignPioneer
          ? input.contributorId
          : zone.pioneerUserId,
        updatedAt: new Date(),
      })
      .where(eq(mapZone.id, zone.id));

    if (shouldAssignPioneer) {
      const [account] = await tx
        .select({ id: pointsAccount.id })
        .from(pointsAccount)
        .where(eq(pointsAccount.userId, input.contributorId))
        .limit(1);

      if (account) {
        const referenceId = `map-pioneer:${zone.id}`;
        const [existing] = await tx
          .select({ id: pointsLedger.id })
          .from(pointsLedger)
          .where(
            and(
              eq(pointsLedger.accountId, account.id),
              eq(pointsLedger.sourceAction, "map_pioneer_bonus"),
              eq(pointsLedger.referenceId, referenceId),
            ),
          )
          .limit(1);

        if (!existing) {
          await tx.insert(pointsLedger).values({
            accountId: account.id,
            amount: MAP_POINTS_PIONEER_BONUS,
            sourceAction: "map_pioneer_bonus",
            referenceId,
          });

          await tx
            .update(pointsAccount)
            .set({
              totalPoints: sql`${pointsAccount.totalPoints} + ${MAP_POINTS_PIONEER_BONUS}`,
              updatedAt: new Date(),
            })
            .where(eq(pointsAccount.id, account.id));
          pioneerAwarded = true;
        }
      }
    }

    await tx
      .insert(mapContributorStats)
      .values({ userId: input.contributorId, acceptedContributions: 1 })
      .onConflictDoUpdate({
        target: mapContributorStats.userId,
        set: {
          acceptedContributions: sql`${mapContributorStats.acceptedContributions} + 1`,
          updatedAt: new Date(),
        },
      });

    return {
      zoneId: zone.id,
      percent,
      reached50: previousCount / target < 0.5 && nextCount / target >= 0.5,
      reached100: previousCount / target < 1 && nextCount / target >= 1,
      pioneerAwarded,
    };
  });

  if (!result) {
    return null;
  }

  await setZoneCompletionPercent(result.zoneId, result.percent);
  return result;
}

export async function getZoneDetail(zoneId: string, callerId?: string) {
  const [zone] = await db
    .select()
    .from(mapZone)
    .where(eq(mapZone.id, zoneId))
    .limit(1);

  if (!zone) {
    throw new Error("MAP_ZONE_NOT_FOUND");
  }

  const percent =
    zone.targetFeatureCount > 0
      ? Number(
          ((zone.currentFeatureCount / zone.targetFeatureCount) * 100).toFixed(
            2,
          ),
        )
      : 0;

  const topContributors = await getZoneTopContributors(zoneId);
  const isPioneer = callerId ? zone.pioneerUserId === callerId : false;

  return {
    id: zone.id,
    slug: zone.slug,
    displayName: zone.displayName,
    targetFeatureCount: zone.targetFeatureCount,
    currentFeatureCount: zone.currentFeatureCount,
    completionPercent: Math.min(100, percent),
    topContributors,
    pioneer: zone.pioneerUserId
      ? {
          userId: zone.pioneerUserId,
          isCaller: isPioneer,
        }
      : null,
  };
}

export async function getFeaturePioneerLabel(
  featureId: string,
): Promise<string | null> {
  const [feature] = await db
    .select({
      zoneId: mapFeature.zoneId,
      contributorId: mapFeature.contributorId,
    })
    .from(mapFeature)
    .where(eq(mapFeature.id, featureId))
    .limit(1);

  if (!feature?.zoneId) {
    return null;
  }

  const [zone] = await db
    .select({
      pioneerUserId: mapZone.pioneerUserId,
      displayName: mapZone.displayName,
    })
    .from(mapZone)
    .where(eq(mapZone.id, feature.zoneId))
    .limit(1);

  if (!zone?.pioneerUserId || zone.pioneerUserId !== feature.contributorId) {
    return null;
  }

  return `Pioneer of ${zone.displayName}`;
}
