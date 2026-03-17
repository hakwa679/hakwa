import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import db from "@hakwa/db";
import {
  badge,
  level,
  pointsAccount,
  pointsLedger,
  referral,
  userBadge,
} from "@hakwa/db/schema";
import {
  POINTS_PER_TRIP,
  STREAK_BONUS_7,
  STREAK_BONUS_30,
  STREAK_MILESTONES,
} from "@hakwa/core";
import { redis } from "@hakwa/redis";
import { sendNotification } from "@hakwa/notifications";

type GamificationEventType =
  | "trip_completed"
  | "user_registered"
  | "first_trip_completed"
  | "referral_used";

export interface GamificationEventPayload {
  type: GamificationEventType;
  userId: string;
  tripId?: string;
  referralCode?: string;
  timestamp?: string;
}

function buildReferralCode(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
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

async function computeAndNotifyLevel(userId: string): Promise<void> {
  const account = await db
    .select()
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, userId))
    .limit(1);

  if (!account[0]) return;

  const currentLevel = await db
    .select()
    .from(level)
    .where(
      and(
        eq(level.applicableTo, account[0].actor),
        sql`${level.pointsRequired} <= ${account[0].totalPoints}`,
      ),
    )
    .orderBy(desc(level.pointsRequired))
    .limit(1);

  if (!currentLevel[0]) return;

  const previousLevel = await db
    .select()
    .from(level)
    .where(
      and(
        eq(level.applicableTo, account[0].actor),
        sql`${level.pointsRequired} < ${currentLevel[0].pointsRequired}`,
      ),
    )
    .orderBy(desc(level.pointsRequired))
    .limit(1);

  if ((previousLevel[0]?.levelNumber ?? 0) >= currentLevel[0].levelNumber) {
    return;
  }

  await sendNotification(
    userId,
    "level_up",
    {
      channel: "in_app",
      title: "Level up!",
      body: `You reached ${currentLevel[0].name}.`,
      data: {
        number: currentLevel[0].levelNumber,
        name: currentLevel[0].name,
      },
    },
    `level_up:${userId}:${currentLevel[0].levelNumber}`,
  );

  await publishGamificationRealtime(userId, {
    event: "level_up",
    currentLevel: {
      number: currentLevel[0].levelNumber,
      name: currentLevel[0].name,
      pointsRequired: currentLevel[0].pointsRequired,
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

  await updateStreak(payload.userId);
  await evaluateBadges(payload.userId);
  await computeAndNotifyLevel(payload.userId);
}

async function handleUserRegistered(payload: {
  userId: string;
}): Promise<void> {
  await ensurePointsAccount(payload.userId);
}

async function handleFirstTripCompleted(_payload: {
  userId: string;
  tripId?: string;
}): Promise<void> {
  // Referral first-trip rewards are added in a later implementation slice.
}

async function handleReferralUsed(_payload: {
  userId: string;
  referralCode?: string;
}): Promise<void> {
  // Referral reward/cap handling is added in a later implementation slice.
}

export async function processGamificationEvent(
  payload: GamificationEventPayload,
): Promise<void> {
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
    default:
      throw new Error(`Unsupported gamification event: ${payload.type}`);
  }
}
