import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import { and, desc, eq, sql } from "drizzle-orm";
import db from "@hakwa/db";
import {
  badge,
  level,
  mapContributorStats,
  pointsAccount,
  pointsLedger,
  referral,
  trip,
  tripReview,
  tripReviewTag,
  user,
  userBadge,
} from "@hakwa/db/schema";
import {
  MAX_REFERRAL_REWARDS,
  MAP_POINTS_MAP_STREAK_7,
  POINTS_PER_TRIP,
  REFERRAL_SIGNUP_POINTS,
  REFERRAL_TRIP_POINTS,
  STREAK_BONUS_7,
  STREAK_BONUS_30,
  STREAK_MILESTONES,
} from "@hakwa/core";
import { redis } from "@hakwa/redis";
import { sendNotification } from "@hakwa/notifications";
import { awardMapMilestoneBadges } from "../processors/badgeProcessor.ts";

type GamificationEventType =
  | "trip_completed"
  | "user_registered"
  | "first_trip_completed"
  | "referral_used"
  | "map_points_awarded"
  | "review_submitted";

export interface GamificationEventPayload {
  type: GamificationEventType;
  userId: string;
  tripId?: string;
  referralCode?: string;
  timestamp?: string;
  points?: number;
  sourceAction?:
    | "map_contribution"
    | "map_verification"
    | "map_contribution_accepted"
    | "map_photo_bonus"
    | "map_road_trace"
    | "map_mission_completed"
    | "map_pioneer_bonus"
    | "review_submitted";
  referenceId?: string;
  reviewId?: string;
}

const WEEKLY_REVIEW_MISSION_TARGET = 3;
const WEEKLY_REVIEW_MISSION_BONUS = 50;

type ReputationBadgeKey =
  | "top_rated_driver"
  | "consistent_driver"
  | "five_star_passenger";

function getFijiWeekKey(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Fiji",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function buildReferralCode(): string {
  const generateCode = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    12,
  );
  return generateCode();
}

async function ensurePointsAccount(userId: string) {
  const existing = await db
    .select()
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, userId))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = buildReferralCode();
    const inserted = await db
      .insert(pointsAccount)
      .values({
        userId,
        actor: "passenger",
        referralCode,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return inserted[0];
    }

    const row = await db
      .select()
      .from(pointsAccount)
      .where(eq(pointsAccount.userId, userId))
      .limit(1);

    if (row[0]) {
      return row[0];
    }
  }

  throw new Error("Unable to create points account");
}

async function publishGamificationRealtime(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await redis.publish(
    `user:${userId}:gamification`,
    JSON.stringify({
      ...payload,
      userId,
      createdAt: new Date().toISOString(),
    }),
  );
}

function getWeeklyLeaderboardKey(now = new Date()): string {
  return `leaderboard:weekly:${getFijiWeekKey(now)}`;
}

function getNextFijiMondayUtc(now = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Fiji",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");

  const fijiDateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dow = fijiDateUtc.getUTCDay();
  const daysToNextMonday = dow === 0 ? 1 : 8 - dow;
  fijiDateUtc.setUTCDate(fijiDateUtc.getUTCDate() + daysToNextMonday);

  return new Date(fijiDateUtc.getTime() - 12 * 60 * 60 * 1000);
}

async function bumpWeeklyLeaderboard(
  userId: string,
  points: number,
): Promise<void> {
  const key = getWeeklyLeaderboardKey();
  await redis.zincrby(key, points, userId);
  const expireAt = Math.floor(getNextFijiMondayUtc().getTime() / 1000);
  await redis.expireat(key, expireAt);
}

async function getLevelForPoints(
  actor: "passenger" | "operator",
  points: number,
) {
  const [row] = await db
    .select()
    .from(level)
    .where(
      and(
        eq(level.applicableTo, actor),
        sql`${level.pointsRequired} <= ${points}`,
      ),
    )
    .orderBy(desc(level.pointsRequired))
    .limit(1);

  return row ?? null;
}

async function computeAndNotifyLevel(
  userId: string,
  previousPoints?: number,
): Promise<void> {
  const account = await db
    .select()
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, userId))
    .limit(1);

  if (!account[0]) return;

  const currentLevel = await getLevelForPoints(
    account[0].actor,
    account[0].totalPoints,
  );
  if (!currentLevel) return;

  const priorPoints =
    typeof previousPoints === "number"
      ? previousPoints
      : Math.max(account[0].totalPoints - POINTS_PER_TRIP, 0);
  const previousLevel = await getLevelForPoints(account[0].actor, priorPoints);

  if ((previousLevel?.levelNumber ?? 0) >= currentLevel.levelNumber) {
    return;
  }

  await sendNotification(
    userId,
    "level_up",
    {
      channel: "in_app",
      title: "Level up!",
      body: `You reached ${currentLevel.name}.`,
      data: {
        number: currentLevel.levelNumber,
        name: currentLevel.name,
      },
    },
    `level_up:${userId}:${currentLevel.levelNumber}`,
  );

  await publishGamificationRealtime(userId, {
    event: "level_up",
    currentLevel: {
      number: currentLevel.levelNumber,
      name: currentLevel.name,
      pointsRequired: currentLevel.pointsRequired,
    },
    totalPoints: account[0].totalPoints,
  });
}

async function evaluateBadges(userId: string): Promise<void> {
  const account = await ensurePointsAccount(userId);
  const allBadges = await db
    .select()
    .from(badge)
    .where(eq(badge.applicableTo, account.actor));

  if (allBadges.length === 0) return;

  const tripsCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.accountId, account.id),
        eq(pointsLedger.sourceAction, "trip_completed"),
      ),
    );
  const tripsCount = tripsCountResult[0]?.count ?? 0;

  const referralsResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referral)
    .where(eq(referral.referrerId, userId));
  const referralCount = referralsResult[0]?.count ?? 0;

  for (const b of allBadges) {
    let shouldAward = false;
    if (b.key === "first_trip") shouldAward = tripsCount >= 1;
    if (b.key === "ten_trips") shouldAward = tripsCount >= 10;
    if (b.key === "top_referrer") shouldAward = referralCount >= 5;
    if (!shouldAward) continue;

    const inserted = await db
      .insert(userBadge)
      .values({
        userId,
        badgeKey: b.key,
      })
      .onConflictDoNothing()
      .returning({ badgeKey: userBadge.badgeKey });

    if (!inserted[0]) continue;

    const bonusPoints = 10;
    await db.transaction(async (tx) => {
      await tx.insert(pointsLedger).values({
        accountId: account.id,
        amount: bonusPoints,
        sourceAction: "badge_earned",
        referenceId: `badge:${b.key}`,
      });

      await tx
        .update(pointsAccount)
        .set({
          totalPoints: sql`${pointsAccount.totalPoints} + ${bonusPoints}`,
          updatedAt: new Date(),
        })
        .where(eq(pointsAccount.id, account.id));
    });

    await sendNotification(
      userId,
      "badge_earned",
      {
        channel: "in_app",
        title: "Badge unlocked",
        body: `You earned ${b.name}.`,
        data: {
          key: b.key,
          name: b.name,
          iconUrl: b.iconUrl,
        },
      },
      `badge_earned:${userId}:${b.key}`,
    );

    await publishGamificationRealtime(userId, {
      event: "badge_earned",
      badge: {
        key: b.key,
        name: b.name,
        iconUrl: b.iconUrl,
      },
    });
  }
}

async function evaluateReviewerBadges(userId: string): Promise<void> {
  const [totalReviewsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tripReview)
    .where(eq(tripReview.reviewerUserId, userId));
  const totalReviews = totalReviewsRow?.count ?? 0;

  const [taggedReviewsRow] = await db
    .select({
      count: sql<number>`count(distinct ${tripReviewTag.tripReviewId})::int`,
    })
    .from(tripReviewTag)
    .innerJoin(tripReview, eq(tripReview.id, tripReviewTag.tripReviewId))
    .where(eq(tripReview.reviewerUserId, userId));
  const taggedReviews = taggedReviewsRow?.count ?? 0;

  const completedTrips = await db
    .select({ id: trip.id })
    .from(trip)
    .where(
      and(
        eq(trip.status, "completed"),
        sql`(${trip.passengerId} = ${userId} OR ${trip.driverId} = ${userId})`,
      ),
    )
    .orderBy(desc(trip.completedAt))
    .limit(50);

  let reviewedStreak = 0;
  for (const t of completedTrips) {
    const [reviewed] = await db
      .select({ id: tripReview.id })
      .from(tripReview)
      .where(
        and(eq(tripReview.tripId, t.id), eq(tripReview.reviewerUserId, userId)),
      )
      .limit(1);

    if (!reviewed) {
      break;
    }
    reviewedStreak += 1;
  }

  const milestones: Array<{ key: string; reached: boolean }> = [
    { key: "first_review", reached: totalReviews >= 1 },
    { key: "tagged_reviewer", reached: taggedReviews >= 5 },
    { key: "dedicated_reviewer", reached: totalReviews >= 25 },
    { key: "veteran_reviewer", reached: totalReviews >= 100 },
    { key: "perfect_streak_reviewer", reached: reviewedStreak >= 7 },
  ];

  for (const milestone of milestones) {
    if (!milestone.reached) continue;

    const [inserted] = await db
      .insert(userBadge)
      .values({ userId, badgeKey: milestone.key })
      .onConflictDoNothing()
      .returning({ badgeKey: userBadge.badgeKey });

    if (!inserted) continue;

    const [definition] = await db
      .select({ name: badge.name, iconUrl: badge.iconUrl })
      .from(badge)
      .where(eq(badge.key, milestone.key))
      .limit(1);

    await sendNotification(
      userId,
      "badge_earned",
      {
        channel: "in_app",
        title: "Badge unlocked",
        body: `You earned ${definition?.name ?? milestone.key}.`,
        data: {
          key: milestone.key,
          name: definition?.name ?? milestone.key,
          iconUrl: definition?.iconUrl,
        },
      },
      `review_badge:${userId}:${milestone.key}`,
    );
  }
}

async function getVisibleReviewStatsForUser(userId: string): Promise<{
  count: number;
  avg: number;
  oneStarCount: number;
}> {
  const reviews = await db
    .select({
      id: tripReview.id,
      tripId: tripReview.tripId,
      direction: tripReview.direction,
      rating: tripReview.rating,
    })
    .from(tripReview)
    .where(eq(tripReview.revieweeUserId, userId));

  if (reviews.length === 0) {
    return { count: 0, avg: 0, oneStarCount: 0 };
  }

  const tripIds = [...new Set(reviews.map((r) => r.tripId))];
  const tripRows = await db
    .select({ id: trip.id, completedAt: trip.completedAt })
    .from(trip)
    .where(
      sql`${trip.id} IN (${sql.join(
        tripIds.map((id) => sql`${id}`),
        sql`,`,
      )})`,
    );

  const byTrip = new Map(tripRows.map((row) => [row.id, row]));
  const directionsByTrip = new Map<
    string,
    Set<"passenger_to_driver" | "driver_to_passenger">
  >();
  for (const review of reviews) {
    const set = directionsByTrip.get(review.tripId) ?? new Set();
    set.add(review.direction);
    directionsByTrip.set(review.tripId, set);
  }

  const now = new Date();
  const visible = reviews.filter((review) => {
    const tripRow = byTrip.get(review.tripId);
    if (!tripRow?.completedAt) return false;

    const counterpart =
      review.direction === "passenger_to_driver"
        ? "driver_to_passenger"
        : "passenger_to_driver";

    const hasCounterpart =
      directionsByTrip.get(review.tripId)?.has(counterpart) ?? false;
    if (hasCounterpart) return true;

    const windowHours = counterpart === "driver_to_passenger" ? 24 : 72;
    const expiry = new Date(
      tripRow.completedAt.getTime() + windowHours * 3600 * 1000,
    );
    return now > expiry;
  });

  if (visible.length === 0) {
    return { count: 0, avg: 0, oneStarCount: 0 };
  }

  const sum = visible.reduce((acc, r) => acc + r.rating, 0);
  const oneStarCount = visible.filter((r) => r.rating === 1).length;
  return { count: visible.length, avg: sum / visible.length, oneStarCount };
}

async function emitBadgeRevokedEvent(
  userId: string,
  badgeKey: string,
): Promise<void> {
  await publishGamificationRealtime(userId, {
    event: "badge_revoked",
    badgeKey,
  });

  await sendNotification(
    userId,
    "system_alert",
    {
      channel: "in_app",
      title: "Badge status updated",
      body: `Your ${badgeKey} badge is no longer active based on recent ratings.`,
      data: { badgeKey },
    },
    `badge_revoked:${userId}:${badgeKey}`,
  );
}

async function evaluateReputationBadges(userId: string): Promise<void> {
  const [userRow] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userRow) return;

  const stats = await getVisibleReviewStatsForUser(userId);

  const badgeRules: Array<{ key: ReputationBadgeKey; shouldHave: boolean }> =
    userRow.role === "driver"
      ? [
          {
            key: "top_rated_driver",
            shouldHave: stats.count >= 50 && stats.avg >= 4.8,
          },
          {
            key: "consistent_driver",
            shouldHave: stats.count >= 50 && stats.oneStarCount === 0,
          },
        ]
      : [
          {
            key: "five_star_passenger",
            shouldHave: stats.count >= 20 && stats.avg >= 4.8,
          },
        ];

  for (const rule of badgeRules) {
    const [existing] = await db
      .select({ id: userBadge.id })
      .from(userBadge)
      .where(
        and(eq(userBadge.userId, userId), eq(userBadge.badgeKey, rule.key)),
      )
      .limit(1);

    if (rule.shouldHave && !existing) {
      await db
        .insert(userBadge)
        .values({ userId, badgeKey: rule.key })
        .onConflictDoNothing();
      continue;
    }

    if (!rule.shouldHave && existing) {
      await db
        .delete(userBadge)
        .where(
          and(eq(userBadge.userId, userId), eq(userBadge.badgeKey, rule.key)),
        );
      await emitBadgeRevokedEvent(userId, rule.key);
    }
  }
}

async function handleWeeklyReviewMission(userId: string): Promise<void> {
  const account = await ensurePointsAccount(userId);
  const weekKey = getFijiWeekKey(new Date());
  const referenceId = `mission:weekly_review_3:${weekKey}`;

  const [alreadyAwarded] = await db
    .select({ id: pointsLedger.id })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.accountId, account.id),
        eq(pointsLedger.sourceAction, "streak_bonus"),
        eq(pointsLedger.referenceId, referenceId),
      ),
    )
    .limit(1);

  if (alreadyAwarded) return;

  const weekStart = new Date(`${weekKey}T00:00:00.000Z`);
  const [reviewCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tripReview)
    .where(
      and(
        eq(tripReview.reviewerUserId, userId),
        sql`${tripReview.submittedAt} >= ${weekStart}`,
      ),
    );

  const completed = reviewCountRow?.count ?? 0;
  if (completed < WEEKLY_REVIEW_MISSION_TARGET) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(pointsLedger)
      .values({
        accountId: account.id,
        amount: WEEKLY_REVIEW_MISSION_BONUS,
        sourceAction: "streak_bonus",
        referenceId,
      })
      .onConflictDoNothing();

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${WEEKLY_REVIEW_MISSION_BONUS}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });

  await sendNotification(
    userId,
    "streak_milestone",
    {
      channel: "in_app",
      title: "Weekly mission complete",
      body: `You reviewed ${WEEKLY_REVIEW_MISSION_TARGET} trips this week and earned ${WEEKLY_REVIEW_MISSION_BONUS} points.`,
      data: {
        mission: "weekly_review_3",
        bonusPoints: WEEKLY_REVIEW_MISSION_BONUS,
      },
    },
    `weekly_review_mission:${userId}:${weekKey}`,
  );
}

async function handleReviewSubmitted(payload: {
  userId: string;
  reviewId?: string;
}): Promise<void> {
  await evaluateReviewerBadges(payload.userId);
  await handleWeeklyReviewMission(payload.userId);

  if (!payload.reviewId) {
    return;
  }

  const [review] = await db
    .select({ revieweeUserId: tripReview.revieweeUserId })
    .from(tripReview)
    .where(eq(tripReview.id, payload.reviewId))
    .limit(1);

  if (review?.revieweeUserId) {
    await evaluateReputationBadges(review.revieweeUserId);
  }
}

function getFijiDate(now: Date): Date {
  const fijiFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Fiji",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fijiFormatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

async function updateStreak(userId: string): Promise<void> {
  const account = await ensurePointsAccount(userId);
  const today = getFijiDate(new Date());

  const last = account.streakCheckpoint
    ? getFijiDate(new Date(account.streakCheckpoint))
    : null;

  if (last && last.getTime() === today.getTime()) return;

  const oneDayMs = 24 * 60 * 60 * 1000;
  const previousDay = last
    ? today.getTime() - last.getTime() === oneDayMs
    : false;
  const nextStreak = previousDay ? account.currentStreak + 1 : 1;

  await db
    .update(pointsAccount)
    .set({
      currentStreak: nextStreak,
      longestStreak: Math.max(account.longestStreak, nextStreak),
      streakCheckpoint: today,
      updatedAt: new Date(),
    })
    .where(eq(pointsAccount.id, account.id));

  if (
    !STREAK_MILESTONES.includes(
      nextStreak as (typeof STREAK_MILESTONES)[number],
    )
  ) {
    return;
  }

  const bonus = nextStreak === 7 ? STREAK_BONUS_7 : STREAK_BONUS_30;
  const sourceAction =
    nextStreak === 7 ? "streak_milestone_7" : "streak_milestone_30";

  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      accountId: account.id,
      amount: bonus,
      sourceAction,
      referenceId: `${nextStreak}-day-streak`,
    });

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${bonus}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });

  await sendNotification(
    userId,
    "streak_milestone",
    {
      channel: "in_app",
      title: `${nextStreak}-day streak!`,
      body: `You earned ${bonus} points for keeping your streak alive.`,
      data: { streak: nextStreak, bonusPoints: bonus },
    },
    `streak_milestone:${userId}:${nextStreak}`,
  );

  await publishGamificationRealtime(userId, {
    event: "streak_milestone",
    streak: nextStreak,
    bonusPoints: bonus,
  });
}

export async function handleTripCompleted(payload: {
  userId: string;
  tripId?: string;
}): Promise<void> {
  const account = await ensurePointsAccount(payload.userId);
  const previousPoints = account.totalPoints;

  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      accountId: account.id,
      amount: POINTS_PER_TRIP,
      sourceAction: "trip_completed",
      referenceId: payload.tripId ?? null,
    });

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${POINTS_PER_TRIP}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });

  const refreshed = await db
    .select({ totalPoints: pointsAccount.totalPoints })
    .from(pointsAccount)
    .where(eq(pointsAccount.id, account.id))
    .limit(1);

  await sendNotification(
    payload.userId,
    "trip_completed",
    {
      channel: "in_app",
      title: "Trip points awarded",
      body: `You earned ${POINTS_PER_TRIP} points.`,
      data: {
        sourceAction: "trip_completed",
        points: POINTS_PER_TRIP,
        totalPoints: refreshed[0]?.totalPoints ?? account.totalPoints,
      },
    },
    `trip_points:${payload.userId}:${payload.tripId ?? randomUUID()}`,
  );

  await publishGamificationRealtime(payload.userId, {
    event: "points_awarded",
    sourceAction: "trip_completed",
    points: POINTS_PER_TRIP,
    totalPoints: refreshed[0]?.totalPoints ?? account.totalPoints,
    tripId: payload.tripId,
  });

  await bumpWeeklyLeaderboard(payload.userId, POINTS_PER_TRIP);

  await updateStreak(payload.userId);
  await evaluateBadges(payload.userId);
  await computeAndNotifyLevel(payload.userId, previousPoints);
}

async function handleUserRegistered(payload: {
  userId: string;
}): Promise<void> {
  await ensurePointsAccount(payload.userId);
}

async function handleFirstTripCompleted(payload: {
  userId: string;
  tripId?: string;
}): Promise<void> {
  const [activeReferral] = await db
    .select({
      id: referral.id,
      referrerId: referral.referrerId,
      firstTripBonusLedgerId: referral.firstTripBonusLedgerId,
    })
    .from(referral)
    .where(eq(referral.refereeId, payload.userId))
    .limit(1);

  if (!activeReferral || activeReferral.firstTripBonusLedgerId) {
    return;
  }

  const [awardedCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referral)
    .where(
      and(
        eq(referral.referrerId, activeReferral.referrerId),
        sql`${referral.firstTripBonusLedgerId} IS NOT NULL`,
      ),
    );

  if ((awardedCountRow?.count ?? 0) >= MAX_REFERRAL_REWARDS) {
    return;
  }

  const referrerAccount = await ensurePointsAccount(activeReferral.referrerId);
  const referenceId = `referral:${activeReferral.id}:first_trip`;

  const [insertedLedger] = await db
    .insert(pointsLedger)
    .values({
      accountId: referrerAccount.id,
      amount: REFERRAL_TRIP_POINTS,
      sourceAction: "referral_trip",
      referenceId,
    })
    .onConflictDoNothing()
    .returning({ id: pointsLedger.id });

  if (!insertedLedger) return;

  await db.transaction(async (tx) => {
    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${REFERRAL_TRIP_POINTS}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, referrerAccount.id));

    await tx
      .update(referral)
      .set({ firstTripBonusLedgerId: insertedLedger.id })
      .where(eq(referral.id, activeReferral.id));
  });

  await sendNotification(
    activeReferral.referrerId,
    "system_alert",
    {
      channel: "in_app",
      title: "Referral reward unlocked",
      body: `You earned ${REFERRAL_TRIP_POINTS} points from your referral's first trip.`,
      data: {
        sourceAction: "referral_trip",
        points: REFERRAL_TRIP_POINTS,
      },
    },
    `referral_trip:${activeReferral.id}`,
  );

  await publishGamificationRealtime(activeReferral.referrerId, {
    event: "points_awarded",
    sourceAction: "referral_trip",
    points: REFERRAL_TRIP_POINTS,
    totalPoints: referrerAccount.totalPoints + REFERRAL_TRIP_POINTS,
  });

  await evaluateBadges(activeReferral.referrerId);
  await computeAndNotifyLevel(
    activeReferral.referrerId,
    referrerAccount.totalPoints,
  );
}

async function handleReferralUsed(payload: {
  userId: string;
  referralCode?: string;
}): Promise<void> {
  if (!payload.referralCode) return;

  const [referrerAccount] = await db
    .select({
      id: pointsAccount.id,
      userId: pointsAccount.userId,
      totalPoints: pointsAccount.totalPoints,
    })
    .from(pointsAccount)
    .where(eq(pointsAccount.referralCode, payload.referralCode))
    .limit(1);

  if (!referrerAccount || referrerAccount.userId === payload.userId) {
    return;
  }

  const [createdReferral] = await db
    .insert(referral)
    .values({
      referrerId: referrerAccount.userId,
      refereeId: payload.userId,
    })
    .onConflictDoNothing()
    .returning({ id: referral.id });

  if (!createdReferral) return;

  const [awardedCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referral)
    .where(
      and(
        eq(referral.referrerId, referrerAccount.userId),
        sql`${referral.signupBonusLedgerId} IS NOT NULL`,
      ),
    );

  if ((awardedCountRow?.count ?? 0) >= MAX_REFERRAL_REWARDS) {
    await sendNotification(
      referrerAccount.userId,
      "system_alert",
      {
        channel: "in_app",
        title: "Referral cap reached",
        body: "You reached the maximum referral signup rewards for this phase.",
        data: { maxReferralRewards: MAX_REFERRAL_REWARDS },
      },
      `referral_cap:${referrerAccount.userId}`,
    );
    return;
  }

  const [insertedLedger] = await db
    .insert(pointsLedger)
    .values({
      accountId: referrerAccount.id,
      amount: REFERRAL_SIGNUP_POINTS,
      sourceAction: "referral_signup",
      referenceId: `referral:${createdReferral.id}:signup`,
    })
    .onConflictDoNothing()
    .returning({ id: pointsLedger.id });

  if (!insertedLedger) return;

  await db.transaction(async (tx) => {
    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${REFERRAL_SIGNUP_POINTS}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, referrerAccount.id));

    await tx
      .update(referral)
      .set({ signupBonusLedgerId: insertedLedger.id })
      .where(eq(referral.id, createdReferral.id));
  });

  await sendNotification(
    referrerAccount.userId,
    "system_alert",
    {
      channel: "in_app",
      title: "Referral reward unlocked",
      body: `You earned ${REFERRAL_SIGNUP_POINTS} points for a successful referral signup.`,
      data: {
        sourceAction: "referral_signup",
        points: REFERRAL_SIGNUP_POINTS,
      },
    },
    `referral_signup:${createdReferral.id}`,
  );

  await publishGamificationRealtime(referrerAccount.userId, {
    event: "points_awarded",
    sourceAction: "referral_signup",
    points: REFERRAL_SIGNUP_POINTS,
    totalPoints: referrerAccount.totalPoints + REFERRAL_SIGNUP_POINTS,
  });

  await evaluateBadges(referrerAccount.userId);
  await computeAndNotifyLevel(
    referrerAccount.userId,
    referrerAccount.totalPoints,
  );
}

function getMapLeaderboardKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `map:leaderboard:monthly:${year}-${month}`;
}

function getFijiDateKey(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Fiji",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

async function updateMapStreakAndBonus(userId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(mapContributorStats)
    .where(eq(mapContributorStats.userId, userId))
    .limit(1);

  const now = new Date();
  const todayKey = getFijiDateKey(now);
  const lastKey = existing?.mapStreakCheckpoint
    ? getFijiDateKey(new Date(existing.mapStreakCheckpoint))
    : null;

  if (lastKey === todayKey) {
    return;
  }

  let nextStreak = 1;
  if (existing?.mapStreakCheckpoint) {
    const last = new Date(existing.mapStreakCheckpoint);
    const diffMs = now.getTime() - last.getTime();
    nextStreak =
      diffMs <= 36 * 60 * 60 * 1000 ? (existing.mapStreak ?? 0) + 1 : 1;
  }

  await db
    .insert(mapContributorStats)
    .values({
      userId,
      mapStreak: nextStreak,
      mapStreakCheckpoint: now,
    })
    .onConflictDoUpdate({
      target: mapContributorStats.userId,
      set: {
        mapStreak: nextStreak,
        mapStreakCheckpoint: now,
        updatedAt: now,
      },
    });

  if (nextStreak !== 7) {
    return;
  }

  const account = await ensurePointsAccount(userId);
  const referenceId = `map-streak-7:${todayKey}`;

  const [alreadyAwarded] = await db
    .select({ id: pointsLedger.id })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.accountId, account.id),
        eq(pointsLedger.sourceAction, "streak_bonus"),
        eq(pointsLedger.referenceId, referenceId),
      ),
    )
    .limit(1);

  if (alreadyAwarded) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      accountId: account.id,
      amount: MAP_POINTS_MAP_STREAK_7,
      sourceAction: "streak_bonus",
      referenceId,
    });

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${MAP_POINTS_MAP_STREAK_7}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });
}

async function handleMapPointsAwarded(eventPayload: {
  userId: string;
  points?: number;
  sourceAction?:
    | "map_contribution"
    | "map_verification"
    | "map_contribution_accepted"
    | "map_photo_bonus"
    | "map_road_trace"
    | "map_mission_completed"
    | "map_pioneer_bonus";
  referenceId?: string;
}): Promise<void> {
  const points = eventPayload.points ?? 0;
  if (!Number.isFinite(points) || points <= 0 || !eventPayload.sourceAction) {
    return;
  }
  const sourceAction = eventPayload.sourceAction;

  const account = await ensurePointsAccount(eventPayload.userId);
  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      accountId: account.id,
      amount: points,
      sourceAction,
      referenceId: eventPayload.referenceId ?? null,
    });

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${points}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });

  await redis.zincrby(getMapLeaderboardKey(), points, eventPayload.userId);
  await bumpWeeklyLeaderboard(eventPayload.userId, points);
  await updateMapStreakAndBonus(eventPayload.userId);
  await evaluateBadges(eventPayload.userId);

  const mapMilestones = await awardMapMilestoneBadges(eventPayload.userId);
  if (mapMilestones.awardedKeys.length > 0) {
    const definitions = await db
      .select({ key: badge.key, name: badge.name })
      .from(badge)
      .where(
        sql`${badge.key} IN (${sql.join(
          mapMilestones.awardedKeys.map((key) => sql`${key}`),
          sql`,`,
        )})`,
      );

    for (const awarded of mapMilestones.awardedKeys) {
      const detail = definitions.find((row) => row.key === awarded);
      await sendNotification(
        eventPayload.userId,
        "badge_earned",
        {
          channel: "in_app",
          title: "New map badge unlocked",
          body: `You earned the ${detail?.name ?? "Map milestone"} badge. Keep mapping Fiji!`,
          data: {
            badgeKey: awarded,
            badgeName: detail?.name ?? "Map milestone",
          },
        },
        `map_badge:${eventPayload.userId}:${awarded}`,
      );
    }
  }
}

function isMapPointsSourceAction(
  value: GamificationEventPayload["sourceAction"],
): value is
  | "map_contribution"
  | "map_verification"
  | "map_contribution_accepted"
  | "map_photo_bonus"
  | "map_road_trace"
  | "map_mission_completed"
  | "map_pioneer_bonus" {
  return (
    value === "map_contribution" ||
    value === "map_verification" ||
    value === "map_contribution_accepted" ||
    value === "map_photo_bonus" ||
    value === "map_road_trace" ||
    value === "map_mission_completed" ||
    value === "map_pioneer_bonus"
  );
}

export async function processGamificationEvent(
  payload: GamificationEventPayload,
): Promise<void> {
  try {
    switch (payload.type) {
      case "trip_completed":
        await handleTripCompleted(payload);
        return;
      case "user_registered":
        await handleUserRegistered(payload);
        return;
      case "first_trip_completed":
        await handleFirstTripCompleted(payload);
        return;
      case "referral_used":
        await handleReferralUsed(payload);
        return;
      case "map_points_awarded":
        await handleMapPointsAwarded({
          userId: payload.userId,
          ...(typeof payload.points === "number"
            ? { points: payload.points }
            : {}),
          ...(isMapPointsSourceAction(payload.sourceAction)
            ? { sourceAction: payload.sourceAction }
            : {}),
          ...(typeof payload.referenceId === "string"
            ? { referenceId: payload.referenceId }
            : {}),
        });
        return;
      case "review_submitted":
        await handleReviewSubmitted(payload);
        return;
      default:
        return;
    }
  } catch (err) {
    console.error("[gamificationProcessor] non-fatal processing error", {
      type: payload.type,
      userId: payload.userId,
      err,
    });
  }
}
