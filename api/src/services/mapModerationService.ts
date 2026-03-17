import db from "@hakwa/db";
import {
  mapContributorTrust,
  mapFeature,
  mapFeatureReport,
  mapModerationLog,
} from "@hakwa/db/schema";
import { MAP_REPORT_AUTO_REVIEW_THRESHOLD } from "@hakwa/core";
import { and, eq, inArray, sql } from "drizzle-orm";

export interface ReportFeatureInput {
  reason: string;
  note?: string;
}

export async function reportMapFeature(
  reporterId: string,
  featureId: string,
  input: ReportFeatureInput,
): Promise<{ id: string; status: string; escalated: boolean }> {
  const [feature] = await db
    .select({
      id: mapFeature.id,
      contributorId: mapFeature.contributorId,
      status: mapFeature.status,
    })
    .from(mapFeature)
    .where(eq(mapFeature.id, featureId))
    .limit(1);

  if (!feature) {
    throw new Error("MAP_FEATURE_NOT_FOUND");
  }

  if (feature.contributorId === reporterId) {
    throw new Error("MAP_CANNOT_REPORT_OWN");
  }

  if (feature.status !== "pending" && feature.status !== "active") {
    throw new Error("MAP_VOTING_CLOSED");
  }

  const [duplicate] = await db
    .select({ id: mapFeatureReport.id })
    .from(mapFeatureReport)
    .where(
      and(
        eq(mapFeatureReport.featureId, featureId),
        eq(mapFeatureReport.reporterId, reporterId),
      ),
    )
    .limit(1);

  if (duplicate) {
    throw new Error("MAP_ALREADY_REPORTED");
  }

  return db.transaction(async (tx) => {
    await tx.insert(mapFeatureReport).values({
      featureId,
      reporterId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
    });

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(mapFeatureReport)
      .where(eq(mapFeatureReport.featureId, featureId))
      .limit(1);

    const reportCount = countRows[0]?.count ?? 0;
    const escalated = reportCount >= MAP_REPORT_AUTO_REVIEW_THRESHOLD;

    const [updated] = await tx
      .update(mapFeature)
      .set({
        reporterCount: reportCount,
        ...(escalated ? { status: "under_review" as const } : {}),
      })
      .where(eq(mapFeature.id, featureId))
      .returning({ id: mapFeature.id, status: mapFeature.status });

    if (!updated) {
      throw new Error("MAP_FEATURE_NOT_FOUND");
    }

    return { id: updated.id, status: updated.status, escalated };
  });
}

export async function listModerationQueue(params: {
  limit?: number;
  offset?: number;
}) {
  return db
    .select({
      id: mapFeature.id,
      contributorId: mapFeature.contributorId,
      status: mapFeature.status,
      title: mapFeature.title,
      description: mapFeature.description,
      createdAt: mapFeature.createdAt,
      reporterCount: mapFeature.reporterCount,
    })
    .from(mapFeature)
    .where(inArray(mapFeature.status, ["pending_review", "under_review"]))
    .limit(params.limit ?? 20)
    .offset(params.offset ?? 0);
}

export async function moderateMapFeature(input: {
  featureId: string;
  moderatorId: string;
  action: "approve" | "reject" | "warn_contributor" | "ban_contributor";
  reason?: string;
}): Promise<{ id: string; status: string; action: string }> {
  return db.transaction(async (tx) => {
    const lockedRows = await tx.execute(sql`
      SELECT id, contributor_id AS "contributorId", status
      FROM map_feature
      WHERE id = ${input.featureId}
      FOR UPDATE
    `);

    const feature = lockedRows.rows[0] as
      | { id: string; contributorId: string; status: string }
      | undefined;

    if (!feature) {
      throw new Error("MAP_FEATURE_NOT_FOUND");
    }

    let nextStatus = feature.status;
    if (input.action === "approve") {
      nextStatus = feature.status === "pending_review" ? "pending" : "active";
    }
    if (input.action === "reject") {
      nextStatus = "rejected";
    }

    await tx
      .update(mapFeature)
      .set({ status: nextStatus as typeof mapFeature.$inferInsert.status })
      .where(eq(mapFeature.id, input.featureId));

    if (input.action === "ban_contributor") {
      await tx
        .insert(mapContributorTrust)
        .values({
          userId: feature.contributorId,
          isMapBanned: true,
          ...(input.reason ? { banReason: input.reason } : {}),
        })
        .onConflictDoUpdate({
          target: mapContributorTrust.userId,
          set: {
            isMapBanned: true,
            ...(input.reason ? { banReason: input.reason } : {}),
            updatedAt: new Date(),
          },
        });
    }

    await tx.insert(mapModerationLog).values({
      featureId: input.featureId,
      moderatorId: input.moderatorId,
      action: input.action,
      ...(input.reason ? { reason: input.reason } : {}),
    });

    return {
      id: input.featureId,
      status: nextStatus,
      action: input.action,
    };
  });
}
