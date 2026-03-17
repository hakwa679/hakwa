import db from "@hakwa/db";
import {
  mapContributorStats,
  mapFeature,
  mapVerification,
  pointsAccount,
  pointsLedger,
  user,
} from "@hakwa/db/schema";
import { MAP_POINTS_VERIFICATION } from "@hakwa/core";
import { and, eq, sql } from "drizzle-orm";
import { assertNotMapBanned, getTrustTier } from "./mapSafetyService.ts";
import { getFeatureForVerification } from "./mapQueryService.ts";
import { applyFeatureVoteThresholds } from "./mapLifecycleService.ts";
import { updateMissionProgressForAction } from "./mapMissionService.ts";

export interface VerifyMapFeatureInput {
  vote: "confirm" | "dispute";
  disputeCategory?: string;
}

export interface VerifyMapFeatureResult {
  id: string;
  status: string;
  confirmCount: number;
  disputeCount: number;
}

export async function verifyMapFeature(
  userId: string,
  featureId: string,
  input: VerifyMapFeatureInput,
): Promise<VerifyMapFeatureResult> {
  await assertNotMapBanned(userId);

  if (input.vote !== "confirm" && input.vote !== "dispute") {
    throw new Error("MAP_INVALID_VOTE");
  }

  const feature = await getFeatureForVerification(featureId);
  if (!feature) {
    throw new Error("MAP_FEATURE_NOT_FOUND");
  }

  if (feature.contributorId === userId) {
    throw new Error("MAP_CANNOT_VERIFY_OWN");
  }

  if (feature.status !== "pending") {
    throw new Error("MAP_VOTING_CLOSED");
  }

  const [existingVote] = await db
    .select({ id: mapVerification.id })
    .from(mapVerification)
    .where(
      and(
        eq(mapVerification.featureId, featureId),
        eq(mapVerification.userId, userId),
      ),
    )
    .limit(1);

  if (existingVote) {
    throw new Error("MAP_ALREADY_VOTED");
  }

  const trustTier = await getTrustTier(userId);
  const shouldEscalateToReview =
    input.vote === "dispute" &&
    (input.disputeCategory === "harmful_content" ||
      input.disputeCategory === "dangerous_info") &&
    (trustTier === "trusted" || trustTier === "senior");

  return db
    .transaction(async (tx) => {
      await tx.insert(mapVerification).values({
        featureId,
        userId,
        vote: input.vote,
        ...(input.disputeCategory
          ? { disputeCategory: input.disputeCategory }
          : {}),
      });

      const [updatedFeature] = await tx
        .update(mapFeature)
        .set(
          input.vote === "confirm"
            ? { confirmCount: sql`${mapFeature.confirmCount} + 1` }
            : { disputeCount: sql`${mapFeature.disputeCount} + 1` },
        )
        .where(eq(mapFeature.id, featureId))
        .returning({
          id: mapFeature.id,
          status: mapFeature.status,
          confirmCount: mapFeature.confirmCount,
          disputeCount: mapFeature.disputeCount,
        });

      if (!updatedFeature) {
        throw new Error("MAP_FEATURE_NOT_FOUND");
      }

      await tx
        .insert(mapContributorStats)
        .values({ userId, verificationCount: 1 })
        .onConflictDoUpdate({
          target: mapContributorStats.userId,
          set: {
            verificationCount: sql`${mapContributorStats.verificationCount} + 1`,
            updatedAt: new Date(),
          },
        });

      const userRows = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      const actor = userRows[0]?.role === "driver" ? "operator" : "passenger";

      const [account] = await tx
        .insert(pointsAccount)
        .values({
          userId,
          actor,
          referralCode: `MAP-${userId.slice(0, 8).toUpperCase()}`,
          totalPoints: MAP_POINTS_VERIFICATION,
        })
        .onConflictDoUpdate({
          target: pointsAccount.userId,
          set: {
            totalPoints: sql`${pointsAccount.totalPoints} + ${MAP_POINTS_VERIFICATION}`,
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
          amount: MAP_POINTS_VERIFICATION,
          sourceAction: "map_verification",
          referenceId: featureId,
        });
      }

      return updatedFeature;
    })
    .then(async () => {
      await updateMissionProgressForAction({
        userId,
        actionType: "verify_feature",
      });

      if (shouldEscalateToReview) {
        const [updated] = await db
          .update(mapFeature)
          .set({ status: "under_review" })
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
      }

      return applyFeatureVoteThresholds(featureId);
    });
}
