import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import db from "@hakwa/db";
import {
  badge,
  pointsAccount,
  pointsLedger,
  trip,
  tripReview,
  tripReviewTag,
  reviewTag,
  user,
  userBadge,
  type ReviewDirection,
} from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { ReviewAppError } from "@hakwa/errors";
import type {
  ReputationSignalResponse,
  ReputationSummaryResponse,
  ReviewDirection as ApiReviewDirection,
  ReviewPointsBreakdown,
  SubmitReviewResponse,
  TripReviewsResponse,
} from "@hakwa/types";

const MAX_COMMENT_LENGTH = 280;
const PASSENGER_REVIEW_WINDOW_HOURS = 72;
const DRIVER_REVIEW_WINDOW_HOURS = 24;

const DIRECTION_WINDOWS_HOURS: Record<ReviewDirection, number> = {
  passenger_to_driver: PASSENGER_REVIEW_WINDOW_HOURS,
  driver_to_passenger: DRIVER_REVIEW_WINDOW_HOURS,
};

interface SubmitReviewInput {
  reviewerUserId: string;
  tripId: string;
  rating: number;
  tagKeys?: string[];
  comment?: string;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function oppositeDirection(direction: ReviewDirection): ReviewDirection {
  return direction === "passenger_to_driver"
    ? "driver_to_passenger"
    : "passenger_to_driver";
}

function normalizeTagKeys(tagKeys: string[] | undefined): string[] {
  if (!tagKeys || tagKeys.length === 0) return [];
  return [...new Set(tagKeys.map((key) => key.trim()).filter(Boolean))];
}

function normalizeComment(comment: string | undefined): string | null {
  if (!comment) return null;
  const normalized = comment.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw new ReviewAppError(
      "REVIEW_COMMENT_TOO_LONG",
      `Comment must be ${MAX_COMMENT_LENGTH} characters or less.`,
    );
  }
  return normalized;
}

export function calculateReviewPoints(input: {
  tagKeys: string[];
  comment: string | null;
}): ReviewPointsBreakdown {
  const base = 10;
  const tagBonus = input.tagKeys.length >= 2 ? 5 : 0;
  const commentBonus = input.comment ? 10 : 0;
  const total = base + tagBonus + commentBonus;

  return { base, tagBonus, commentBonus, total };
}

function getDirectionForReviewer(input: {
  reviewerUserId: string;
  passengerId: string;
  driverId: string | null;
}): ReviewDirection {
  if (input.reviewerUserId === input.passengerId) {
    return "passenger_to_driver";
  }

  if (input.driverId && input.reviewerUserId === input.driverId) {
    return "driver_to_passenger";
  }

  throw new ReviewAppError(
    "REVIEW_NOT_PARTICIPANT",
    "You are not a participant in this trip.",
  );
}

async function ensurePointsAccount(input: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: string;
  points: number;
}): Promise<{ id: string; totalPoints: number }> {
  const userRows = await input.tx
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  const actor = userRows[0]?.role === "driver" ? "operator" : "passenger";

  const [upserted] = await input.tx
    .insert(pointsAccount)
    .values({
      userId: input.userId,
      actor,
      referralCode: `REV-${randomUUID().slice(0, 8).toUpperCase()}`,
      totalPoints: input.points,
    })
    .onConflictDoUpdate({
      target: pointsAccount.userId,
      set: {
        totalPoints: sql`${pointsAccount.totalPoints} + ${input.points}`,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: pointsAccount.id,
      totalPoints: pointsAccount.totalPoints,
    });

  if (upserted) return upserted;

  const [existing] = await input.tx
    .select({ id: pointsAccount.id, totalPoints: pointsAccount.totalPoints })
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, input.userId))
    .limit(1);

  if (!existing) {
    throw new Error("Failed to resolve points account after upsert.");
  }

  return existing;
}

async function publishRevealEventsIfApplicable(tripId: string): Promise<void> {
  const reviews = await db
    .select({
      direction: tripReview.direction,
      reviewerUserId: tripReview.reviewerUserId,
      revieweeUserId: tripReview.revieweeUserId,
    })
    .from(tripReview)
    .where(eq(tripReview.tripId, tripId));

  const hasPassengerReview = reviews.some(
    (row) => row.direction === "passenger_to_driver",
  );
  const hasDriverReview = reviews.some(
    (row) => row.direction === "driver_to_passenger",
  );

  if (!hasPassengerReview || !hasDriverReview) return;

  const revealedFor = [...new Set(reviews.map((row) => row.revieweeUserId))];

  await Promise.all(
    revealedFor.map((userId) =>
      redis.publish(
        `review:revealed:${userId}`,
        JSON.stringify({
          type: "review.revealed",
          tripId,
          userId,
          at: new Date().toISOString(),
        }),
      ),
    ),
  );

  if (revealedFor.length > 0) {
    await redis.del(...revealedFor.map((userId) => `reputation:${userId}`));
  }
}

export async function getReviewTags(input: {
  direction?: ApiReviewDirection;
  includeNegative?: boolean;
}) {
  const tags = await db
    .select({
      key: reviewTag.key,
      label: reviewTag.label,
      icon: reviewTag.icon,
      direction: reviewTag.direction,
      sortOrder: reviewTag.sortOrder,
      isNegative: reviewTag.isNegative,
    })
    .from(reviewTag)
    .orderBy(reviewTag.sortOrder, reviewTag.label);

  return tags
    .filter((tag) => {
      const directionMatches =
        !input.direction ||
        tag.direction === "both" ||
        tag.direction === input.direction;
      if (!directionMatches) return false;

      if (
        !input.includeNegative &&
        tag.isNegative &&
        tag.key === "late_arrival"
      ) {
        return false;
      }

      return true;
    })
    .map((tag) => ({
      key: tag.key,
      label: tag.label,
      icon: tag.icon,
      direction: tag.direction,
      sortOrder: tag.sortOrder,
    }));
}

export async function submitReview(
  input: SubmitReviewInput,
): Promise<SubmitReviewResponse> {
  const startedAtMs = Date.now();
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewAppError(
      "REVIEW_INVALID_RATING",
      "Rating must be an integer between 1 and 5.",
    );
  }

  const tagKeys = normalizeTagKeys(input.tagKeys);
  const comment = normalizeComment(input.comment);

  const [tripRow] = await db
    .select({
      id: trip.id,
      status: trip.status,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      completedAt: trip.completedAt,
    })
    .from(trip)
    .where(eq(trip.id, input.tripId))
    .limit(1);

  if (!tripRow) {
    throw new ReviewAppError("REVIEW_TRIP_NOT_FOUND", "Trip not found.");
  }

  if (tripRow.status !== "completed" || !tripRow.completedAt) {
    throw new ReviewAppError(
      "REVIEW_TRIP_NOT_COMPLETED",
      "Trip is not completed yet.",
    );
  }

  const direction = getDirectionForReviewer({
    reviewerUserId: input.reviewerUserId,
    passengerId: tripRow.passengerId,
    driverId: tripRow.driverId,
  });

  const revieweeUserId =
    direction === "passenger_to_driver"
      ? tripRow.driverId
      : tripRow.passengerId;

  if (!revieweeUserId) {
    throw new ReviewAppError(
      "REVIEW_TRIP_NOT_COMPLETED",
      "Trip does not have a completed counterpart to review.",
    );
  }

  const windowEndsAt = addHours(
    tripRow.completedAt,
    DIRECTION_WINDOWS_HOURS[direction],
  );
  if (new Date() > windowEndsAt) {
    throw new ReviewAppError(
      "REVIEW_WINDOW_CLOSED",
      "Review window is closed for this trip.",
    );
  }

  const tags =
    tagKeys.length === 0
      ? []
      : await db
          .select({ key: reviewTag.key, direction: reviewTag.direction })
          .from(reviewTag)
          .where(inArray(reviewTag.key, tagKeys));

  if (tags.length !== tagKeys.length) {
    throw new ReviewAppError(
      "REVIEW_INVALID_TAG",
      "One or more review tags are invalid.",
    );
  }

  const hasDirectionMismatch = tags.some(
    (tag) => tag.direction !== "both" && tag.direction !== direction,
  );
  if (hasDirectionMismatch) {
    throw new ReviewAppError(
      "REVIEW_INVALID_TAG",
      "One or more review tags do not match review direction.",
    );
  }

  const pointsBreakdown = calculateReviewPoints({ tagKeys, comment });

  let reviewId = "";
  let submittedAtIso = new Date().toISOString();
  let newTotalPoints = 0;

  try {
    await db.transaction(async (tx) => {
      const [createdReview] = await tx
        .insert(tripReview)
        .values({
          tripId: input.tripId,
          reviewerUserId: input.reviewerUserId,
          revieweeUserId,
          direction,
          rating: input.rating,
          comment,
          pointsAwarded: pointsBreakdown.total,
          submittedAt: new Date(),
        })
        .returning({ id: tripReview.id, submittedAt: tripReview.submittedAt });

      if (!createdReview) {
        throw new ReviewAppError(
          "REVIEW_ALREADY_SUBMITTED",
          "Review already submitted for this trip and direction.",
        );
      }

      reviewId = createdReview.id;
      submittedAtIso = createdReview.submittedAt.toISOString();

      if (tagKeys.length > 0) {
        await tx.insert(tripReviewTag).values(
          tagKeys.map((key) => ({
            tripReviewId: createdReview.id,
            reviewTagKey: key,
          })),
        );
      }

      const account = await ensurePointsAccount({
        tx,
        userId: input.reviewerUserId,
        points: pointsBreakdown.total,
      });

      newTotalPoints = account.totalPoints;

      await tx
        .insert(pointsLedger)
        .values({
          accountId: account.id,
          amount: pointsBreakdown.total,
          sourceAction: "review_submitted",
          referenceId: createdReview.id,
        })
        .onConflictDoNothing({
          target: [
            pointsLedger.accountId,
            pointsLedger.sourceAction,
            pointsLedger.referenceId,
          ],
        });
    });
  } catch (error) {
    const maybeDbError = error as { code?: string; constraint?: string };
    if (
      maybeDbError.code === "23505" &&
      maybeDbError.constraint === "trip_review_trip_direction_unique"
    ) {
      throw new ReviewAppError(
        "REVIEW_ALREADY_SUBMITTED",
        "Review already submitted for this trip and direction.",
      );
    }
    throw error;
  }

  await redis.xadd(
    "gamification:events",
    "*",
    "type",
    "review_submitted",
    "userId",
    input.reviewerUserId,
    "tripId",
    input.tripId,
    "reviewId",
    reviewId,
    "points",
    pointsBreakdown.total.toString(),
    "timestamp",
    new Date().toISOString(),
  );

  await publishRevealEventsIfApplicable(input.tripId);

  const dayKey = new Date().toISOString().slice(0, 10);
  await redis.hincrby(`review:metrics:${dayKey}`, "submissions", 1);
  await redis.hincrby(
    `review:metrics:${dayKey}`,
    "submitLatencyMsTotal",
    Date.now() - startedAtMs,
  );

  return {
    review: {
      id: reviewId,
      tripId: input.tripId,
      direction,
      rating: input.rating,
      tagKeys,
      comment,
      pointsAwarded: pointsBreakdown.total,
      submittedAt: submittedAtIso,
    },
    pointsBreakdown,
    badgesAwarded: [],
    newTotalPoints,
    missionProgress: null,
  };
}

interface VisibilityContext {
  currentDirection: ReviewDirection;
  hasCounterpartReview: boolean;
  counterpartWindowExpired: boolean;
  isOwnReview: boolean;
}

function canViewerSeeReview(context: VisibilityContext): boolean {
  if (context.isOwnReview) return true;
  if (context.hasCounterpartReview) return true;
  return context.counterpartWindowExpired;
}

export async function getTripReviews(input: {
  tripId: string;
  viewerUserId: string;
}): Promise<TripReviewsResponse> {
  const [tripRow] = await db
    .select({
      id: trip.id,
      status: trip.status,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      completedAt: trip.completedAt,
    })
    .from(trip)
    .where(eq(trip.id, input.tripId))
    .limit(1);

  if (!tripRow) {
    throw new ReviewAppError("REVIEW_TRIP_NOT_FOUND", "Trip not found.");
  }

  getDirectionForReviewer({
    reviewerUserId: input.viewerUserId,
    passengerId: tripRow.passengerId,
    driverId: tripRow.driverId,
  });

  if (!tripRow.completedAt) {
    throw new ReviewAppError(
      "REVIEW_TRIP_NOT_COMPLETED",
      "Trip is not completed yet.",
    );
  }

  const reviews = await db
    .select({
      id: tripReview.id,
      direction: tripReview.direction,
      rating: tripReview.rating,
      comment: tripReview.comment,
      submittedAt: tripReview.submittedAt,
      reviewerUserId: tripReview.reviewerUserId,
    })
    .from(tripReview)
    .where(eq(tripReview.tripId, input.tripId))
    .orderBy(tripReview.submittedAt);

  const reviewIds = reviews.map((r) => r.id);
  const tags =
    reviewIds.length === 0
      ? []
      : await db
          .select({
            tripReviewId: tripReviewTag.tripReviewId,
            reviewTagKey: tripReviewTag.reviewTagKey,
          })
          .from(tripReviewTag)
          .where(inArray(tripReviewTag.tripReviewId, reviewIds));

  const tagsByReviewId = new Map<string, string[]>();
  for (const tag of tags) {
    const current = tagsByReviewId.get(tag.tripReviewId) ?? [];
    current.push(tag.reviewTagKey);
    tagsByReviewId.set(tag.tripReviewId, current);
  }

  const hasPassengerReview = reviews.some(
    (row) => row.direction === "passenger_to_driver",
  );
  const hasDriverReview = reviews.some(
    (row) => row.direction === "driver_to_passenger",
  );

  const now = new Date();
  const passengerWindowExpiresAt = addHours(
    tripRow.completedAt,
    PASSENGER_REVIEW_WINDOW_HOURS,
  );
  const driverWindowExpiresAt = addHours(
    tripRow.completedAt,
    DRIVER_REVIEW_WINDOW_HOURS,
  );

  const visibleReviews = reviews
    .filter((row) => {
      const counterpartDirection = oppositeDirection(row.direction);
      const hasCounterpart =
        counterpartDirection === "passenger_to_driver"
          ? hasPassengerReview
          : hasDriverReview;
      const counterpartWindowExpired =
        counterpartDirection === "passenger_to_driver"
          ? now > passengerWindowExpiresAt
          : now > driverWindowExpiresAt;

      return canViewerSeeReview({
        currentDirection: row.direction,
        hasCounterpartReview: hasCounterpart,
        counterpartWindowExpired,
        isOwnReview: row.reviewerUserId === input.viewerUserId,
      });
    })
    .map((row) => ({
      id: row.id,
      direction: row.direction,
      rating: row.rating,
      tagKeys: tagsByReviewId.get(row.id) ?? [],
      comment: row.comment,
      submittedAt: row.submittedAt.toISOString(),
      isOwnReview: row.reviewerUserId === input.viewerUserId,
    }));

  const pendingDirections: ReviewDirection[] = [];
  if (!hasPassengerReview && now <= passengerWindowExpiresAt) {
    pendingDirections.push("passenger_to_driver");
  }
  if (!hasDriverReview && now <= driverWindowExpiresAt) {
    pendingDirections.push("driver_to_passenger");
  }

  return {
    tripId: input.tripId,
    reviews: visibleReviews,
    pendingDirections,
    reviewWindowExpiresAt: {
      passenger_to_driver: passengerWindowExpiresAt.toISOString(),
      driver_to_passenger: driverWindowExpiresAt.toISOString(),
    },
  };
}

function weekStartUtc(date: Date): Date {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - offset);
  return start;
}

export async function getUserReputation(input: {
  userId: string;
  viewerUserId: string;
  includeReviewerStats: boolean;
}): Promise<ReputationSummaryResponse> {
  const cacheKey = `reputation:${input.userId}`;

  if (!input.includeReviewerStats) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReputationSummaryResponse;
    }
  }

  const [userRow] = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);

  if (!userRow) {
    throw new ReviewAppError("REVIEW_USER_NOT_FOUND", "User not found.");
  }

  const reviews = await db
    .select({
      id: tripReview.id,
      tripId: tripReview.tripId,
      direction: tripReview.direction,
      rating: tripReview.rating,
      comment: tripReview.comment,
      submittedAt: tripReview.submittedAt,
      reviewerUserId: tripReview.reviewerUserId,
      revieweeUserId: tripReview.revieweeUserId,
    })
    .from(tripReview)
    .where(eq(tripReview.revieweeUserId, input.userId));

  const tripIds = [...new Set(reviews.map((r) => r.tripId))];
  const trips =
    tripIds.length === 0
      ? []
      : await db
          .select({ id: trip.id, completedAt: trip.completedAt })
          .from(trip)
          .where(and(inArray(trip.id, tripIds), isNotNull(trip.completedAt)));

  const tripById = new Map(trips.map((row) => [row.id, row]));

  const directionByTrip = new Map<string, Set<ReviewDirection>>();
  for (const review of reviews) {
    const set =
      directionByTrip.get(review.tripId) ?? new Set<ReviewDirection>();
    set.add(review.direction);
    directionByTrip.set(review.tripId, set);
  }

  const now = new Date();
  const revealed = reviews.filter((review) => {
    const tripRow = tripById.get(review.tripId);
    if (!tripRow?.completedAt) return false;
    const counterpartDirection = oppositeDirection(review.direction);
    const hasCounterpart =
      directionByTrip.get(review.tripId)?.has(counterpartDirection) ?? false;
    const counterpartWindowExpired =
      now >
      addHours(
        tripRow.completedAt,
        DIRECTION_WINDOWS_HOURS[counterpartDirection],
      );

    return hasCounterpart || counterpartWindowExpired;
  });

  const ratingBreakdown: Record<"1" | "2" | "3" | "4" | "5", number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  let ratingSum = 0;
  for (const review of revealed) {
    ratingBreakdown[String(review.rating) as keyof typeof ratingBreakdown] += 1;
    ratingSum += review.rating;
  }

  const visibleReviewIds = revealed.map((r) => r.id);
  const revealedTags =
    visibleReviewIds.length === 0
      ? []
      : await db
          .select({
            tripReviewId: tripReviewTag.tripReviewId,
            key: reviewTag.key,
            label: reviewTag.label,
            icon: reviewTag.icon,
          })
          .from(tripReviewTag)
          .innerJoin(reviewTag, eq(reviewTag.key, tripReviewTag.reviewTagKey))
          .where(inArray(tripReviewTag.tripReviewId, visibleReviewIds));

  const tagCounts = new Map<
    string,
    { count: number; label: string; icon: string | null }
  >();
  for (const tag of revealedTags) {
    const current = tagCounts.get(tag.key) ?? {
      count: 0,
      label: tag.label,
      icon: tag.icon,
    };
    current.count += 1;
    tagCounts.set(tag.key, current);
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, value]) => ({
      key,
      label: value.label,
      icon: value.icon,
      frequency:
        revealed.length > 0
          ? Number((value.count / revealed.length).toFixed(2))
          : 0,
    }));

  const commentsAllowed =
    userRow.role === "driver" || userRow.role === "operator";
  const recentComments = commentsAllowed
    ? revealed
        .filter((r) => Boolean(r.comment))
        .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
        .slice(0, 5)
        .map((r) => ({
          comment: r.comment!,
          rating: r.rating,
          submittedAt: r.submittedAt.toISOString(),
        }))
    : [];

  const badgeRows = await db
    .select({
      key: userBadge.badgeKey,
      name: badge.name,
      awardedAt: userBadge.awardedAt,
    })
    .from(userBadge)
    .leftJoin(badge, eq(badge.key, userBadge.badgeKey))
    .where(eq(userBadge.userId, input.userId))
    .orderBy(desc(userBadge.awardedAt));

  const baseResponse: ReputationSummaryResponse = {
    userId: userRow.id,
    role: userRow.role,
    ...(input.includeReviewerStats ? {} : { displayName: userRow.name }),
    reputation: {
      averageRating:
        revealed.length >= 3
          ? Number((ratingSum / revealed.length).toFixed(2))
          : null,
      totalReviewsReceived: revealed.length,
      ratingBreakdown,
      topTags,
      recentComments,
      badges: badgeRows.map((row) => ({
        key: row.key,
        name: row.name,
        awardedAt: row.awardedAt.toISOString(),
      })),
    },
  };

  if (!input.includeReviewerStats) {
    await redis.set(cacheKey, JSON.stringify(baseResponse), "EX", 300);
    return baseResponse;
  }

  const [totalSubmittedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tripReview)
    .where(eq(tripReview.reviewerUserId, input.userId));

  const [taggedSubmittedRow] = await db
    .select({
      count: sql<number>`count(distinct ${tripReviewTag.tripReviewId})`,
    })
    .from(tripReviewTag)
    .innerJoin(tripReview, eq(tripReview.id, tripReviewTag.tripReviewId))
    .where(eq(tripReview.reviewerUserId, input.userId));

  const thisWeekStart = weekStartUtc(new Date());
  const [thisWeekSubmittedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tripReview)
    .where(
      and(
        eq(tripReview.reviewerUserId, input.userId),
        gte(tripReview.submittedAt, thisWeekStart),
      ),
    );

  return {
    ...baseResponse,
    reviewerStats: {
      totalReviewsSubmitted: Number(totalSubmittedRow?.count ?? 0),
      taggedReviewsSubmitted: Number(taggedSubmittedRow?.count ?? 0),
      reviewsThisWeek: Number(thisWeekSubmittedRow?.count ?? 0),
    },
  };
}

export async function getPassengerSignal(
  userId: string,
): Promise<ReputationSignalResponse> {
  const reputation = await getUserReputation({
    userId,
    viewerUserId: userId,
    includeReviewerStats: false,
  });

  const avg = reputation.reputation.averageRating;
  const count = reputation.reputation.totalReviewsReceived;

  return {
    userId,
    averageRating: avg,
    totalReviewsReceived: count,
    label: avg ? `${avg.toFixed(1)} ★ passenger` : "New passenger",
  };
}

export async function getDriverSignal(
  userId: string,
): Promise<ReputationSignalResponse> {
  const reputation = await getUserReputation({
    userId,
    viewerUserId: userId,
    includeReviewerStats: false,
  });

  const avg = reputation.reputation.averageRating;
  const count = reputation.reputation.totalReviewsReceived;

  return {
    userId,
    averageRating: avg,
    totalReviewsReceived: count,
    label: avg ? `${avg.toFixed(1)} ★ driver` : "New driver",
  };
}

export function buildNegativeTagAnnotations(
  items: Array<{
    key: string;
    label: string;
    count: number;
    frequency: number;
  }>,
): Array<{ tagKey: string; message: string; severity: "warning" }> {
  return items
    .filter((item) => item.frequency > 0.05)
    .map((item) => ({
      tagKey: item.key,
      message: `${item.count} recent passengers mentioned '${item.label}' — review this pattern to improve your service.`,
      severity: "warning" as const,
    }));
}

export async function getMyDriverDashboard(userId: string): Promise<{
  averageRating: number | null;
  totalReviewsReceived: number;
  monthlyAverages: Array<{
    month: string;
    average: number;
    reviewCount: number;
  }>;
  tagFrequencies: Array<{ key: string; count: number; frequency: number }>;
  annotations: Array<{ tagKey: string; message: string; severity: "warning" }>;
  reputationBadges: Array<{
    key: string;
    name: string | null;
    awardedAt: string;
  }>;
}> {
  const reputation = await getUserReputation({
    userId,
    viewerUserId: userId,
    includeReviewerStats: true,
  });

  const reviews = await db
    .select({
      id: tripReview.id,
      submittedAt: tripReview.submittedAt,
      rating: tripReview.rating,
    })
    .from(tripReview)
    .where(eq(tripReview.revieweeUserId, userId));

  const monthly = new Map<string, { sum: number; count: number }>();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);

  for (const review of reviews) {
    if (review.submittedAt < cutoff) continue;
    const month = review.submittedAt.toISOString().slice(0, 7);
    const current = monthly.get(month) ?? { sum: 0, count: 0 };
    current.sum += review.rating;
    current.count += 1;
    monthly.set(month, current);
  }

  const monthlyAverages = [...monthly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({
      month,
      average: Number((value.sum / value.count).toFixed(2)),
      reviewCount: value.count,
    }));

  const reviewIds = reviews.map((r) => r.id);
  const tagRows =
    reviewIds.length === 0
      ? []
      : await db
          .select({
            key: reviewTag.key,
            label: reviewTag.label,
            isNegative: reviewTag.isNegative,
          })
          .from(tripReviewTag)
          .innerJoin(reviewTag, eq(reviewTag.key, tripReviewTag.reviewTagKey))
          .where(inArray(tripReviewTag.tripReviewId, reviewIds));

  const counts = new Map<
    string,
    { label: string; count: number; isNegative: boolean }
  >();
  for (const row of tagRows) {
    const current = counts.get(row.key) ?? {
      label: row.label,
      count: 0,
      isNegative: row.isNegative,
    };
    current.count += 1;
    counts.set(row.key, current);
  }

  const tagFrequencies = [...counts.entries()]
    .map(([key, row]) => ({
      key,
      count: row.count,
      frequency:
        reputation.reputation.totalReviewsReceived > 0
          ? Number(
              (row.count / reputation.reputation.totalReviewsReceived).toFixed(
                2,
              ),
            )
          : 0,
      isNegative: row.isNegative,
      label: row.label,
    }))
    .sort((a, b) => b.count - a.count);

  const annotations = buildNegativeTagAnnotations(
    tagFrequencies
      .filter((t) => t.isNegative)
      .map((t) => ({
        key: t.key,
        label: t.label,
        count: t.count,
        frequency: t.frequency,
      })),
  );

  const reputationBadges = reputation.reputation.badges.filter((badgeItem) =>
    ["top_rated_driver", "consistent_driver"].includes(badgeItem.key),
  );

  return {
    averageRating: reputation.reputation.averageRating,
    totalReviewsReceived: reputation.reputation.totalReviewsReceived,
    monthlyAverages,
    tagFrequencies: tagFrequencies.map((t) => ({
      key: t.key,
      count: t.count,
      frequency: t.frequency,
    })),
    annotations,
    reputationBadges,
  };
}
