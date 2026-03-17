import db from "@hakwa/db";
import { mapFeature, mapVerification } from "@hakwa/db/schema";
import { MAP_ACTIVATION_THRESHOLD, MAP_REJECTION_THRESHOLD } from "@hakwa/core";
import { eq, sql } from "drizzle-orm";
import {
  invalidateMapActiveLayerCache,
  publishFeatureActivated,
  refreshActiveMapGeoJsonCache,
} from "./mapRedisService.ts";

export async function applyFeatureVoteThresholds(featureId: string): Promise<{
  id: string;
  status: string;
  confirmCount: number;
  disputeCount: number;
}> {
  return db
    .transaction(async (tx) => {
      const lockedRows = await tx.execute(sql`
      SELECT id, status, confirm_count AS "confirmCount", dispute_count AS "disputeCount"
      FROM map_feature
      WHERE id = ${featureId}
      FOR UPDATE
    `);

      const current = lockedRows.rows[0] as
        | {
            id: string;
            status: string;
            confirmCount: number;
            disputeCount: number;
          }
        | undefined;

      if (!current) {
        throw new Error("MAP_FEATURE_NOT_FOUND");
      }

      let nextStatus = current.status;
      if (
        current.confirmCount >= MAP_ACTIVATION_THRESHOLD &&
        current.disputeCount < MAP_REJECTION_THRESHOLD
      ) {
        nextStatus = "active";
      } else if (
        current.disputeCount >= MAP_REJECTION_THRESHOLD &&
        current.confirmCount < MAP_ACTIVATION_THRESHOLD
      ) {
        nextStatus = "rejected";
      }

      const [updated] = await tx
        .update(mapFeature)
        .set({
          status: nextStatus as
            | "pending"
            | "active"
            | "rejected"
            | "stale"
            | "pending_review"
            | "under_review",
          ...(nextStatus === "active" ? { activatedAt: new Date() } : {}),
          ...(nextStatus === "rejected" ? { rejectedAt: new Date() } : {}),
        })
        .where(eq(mapFeature.id, featureId))
        .returning({
          id: mapFeature.id,
          status: mapFeature.status,
          confirmCount: mapFeature.confirmCount,
          disputeCount: mapFeature.disputeCount,
        });

      if (!updated) {
        throw new Error("MAP_FEATURE_NOT_FOUND");
      }

      return updated;
    })
    .then(async (updated) => {
      if (updated.status === "active") {
        await invalidateMapActiveLayerCache();
        await refreshActiveMapGeoJsonCache();
        await publishFeatureActivated(updated.id);
      }
      return updated;
    });
}

export async function reopenFeatureToPending(featureId: string): Promise<{
  id: string;
  status: string;
}> {
  return db
    .transaction(async (tx) => {
      await tx
        .delete(mapVerification)
        .where(eq(mapVerification.featureId, featureId));

      const [updated] = await tx
        .update(mapFeature)
        .set({
          status: "pending",
          confirmCount: 0,
          disputeCount: 0,
          activatedAt: null,
          rejectedAt: null,
        })
        .where(eq(mapFeature.id, featureId))
        .returning({ id: mapFeature.id, status: mapFeature.status });

      if (!updated) {
        throw new Error("MAP_FEATURE_NOT_FOUND");
      }

      return updated;
    })
    .then(async (updated) => {
      await invalidateMapActiveLayerCache();
      return updated;
    });
}
