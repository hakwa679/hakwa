# Quickstart: Gamification System

## Prerequisites

- `pkg/db/schema/gamification.ts` exists with all tables.
- `@hakwa/redis`, `@hakwa/workers`, `@hakwa/notifications` packages built.
- Trip completion flow (spec 004) wired in `api/src/services/tripService.ts`.

---

## Step 1: Confirm Points Source Action Enum

```typescript
// pkg/db/schema/gamification.ts
export const pointsSourceActionEnum = pgEnum("points_source_action", [
  "trip_completed",
  "referral_signup",
  "referral_trip",
  "badge_earned",
  "streak_milestone_7",
  "streak_milestone_30",
  "map_contribution",
  "review_submitted",
]);
```

Apply:

```bash
cd pkg/db && npm run db-push
```

---

## Step 2: Add Gamification Constants

```typescript
// pkg/core/src/gamificationConstants.ts
export const POINTS_PER_TRIP = 10;
export const POINTS_REFERRAL_SIGNUP = 50;
export const POINTS_REFERRAL_TRIP = 100;
export const POINTS_STREAK_7 = 25;
export const POINTS_STREAK_30 = 100;
export const POINTS_MAP_CONTRIBUTION = 5;
export const POINTS_REVIEW_SUBMITTED = 5;
export const MAX_REFERRAL_REWARDS = 20;
export const STREAK_MILESTONES = [7, 30] as const;
```

---

## Step 3: Post-Commit Gamification Event

Add to `api/src/services/tripService.ts` after the completion transaction
commits:

```typescript
import { redis } from "@hakwa/redis";

// after db.transaction(...) resolves:
await redis.xadd("gamification:events", "*", {
  type: "trip_completed",
  userId: trip.passengerId,
  driverId: trip.driverId,
  tripId: trip.id,
});
```

---

## Step 4: Gamification Worker

```typescript
// pkg/workers/src/workers/gamificationProcessor.ts
import { db } from "@hakwa/db";
import {
  pointsAccount,
  pointsLedger,
  userBadge,
  streakCheckpoint,
  referral,
} from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import {
  POINTS_PER_TRIP,
  STREAK_MILESTONES,
  POINTS_STREAK_7,
  POINTS_STREAK_30,
} from "@hakwa/core";
import { sendGamificationNotification } from "@hakwa/notifications";
import { eq, and } from "drizzle-orm";

export async function handleTripCompleted(
  userId: string,
  tripId: string,
): Promise<void> {
  // 1. Award trip points
  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      userId,
      sourceAction: "trip_completed",
      points: POINTS_PER_TRIP,
      description: "Trip completed",
      referenceId: tripId,
    });
    await tx
      .update(pointsAccount)
      .set({ totalPoints: sql`total_points + ${POINTS_PER_TRIP}` })
      .where(eq(pointsAccount.userId, userId));
  });

  // 2. Update Redis weekly leaderboard
  const weekKey = getISOWeekKey(new Date());
  await redis.zadd(
    `leaderboard:weekly:${weekKey}`,
    { incr: true },
    POINTS_PER_TRIP,
    userId,
  );
  await redis.expire(`leaderboard:weekly:${weekKey}`, 8 * 24 * 60 * 60);

  // 3. Update streak
  await updateStreak(userId);

  // 4. Evaluate badges
  await evaluateBadges(userId, tripId);

  // 5. Notify
  await sendGamificationNotification(userId, "points_earned", {
    amount: POINTS_PER_TRIP,
  });
  await redis.publish(
    `user:${userId}:gamification`,
    JSON.stringify({ event: "points_earned", amount: POINTS_PER_TRIP }),
  );
}

async function updateStreak(userId: string): Promise<void> {
  const today = fijiLocalDate();
  const checkpoint = await db.query.streakCheckpoint.findFirst({
    where: (s, { eq }) => eq(s.userId, userId),
  });

  let newStreak = 1;
  if (checkpoint) {
    const diff = dateDiffDays(checkpoint.lastActivityDate, today);
    if (diff === 0) return; // Already credited today
    if (diff === 1) newStreak = checkpoint.currentStreak + 1;
  }

  await db
    .update(streakCheckpoint)
    .set({
      currentStreak: newStreak,
      longestStreak: sql`GREATEST(longest_streak, ${newStreak})`,
      lastActivityDate: today,
      updatedAt: new Date(),
    })
    .where(eq(streakCheckpoint.userId, userId));

  if ((STREAK_MILESTONES as readonly number[]).includes(newStreak)) {
    const bonus = newStreak === 7 ? POINTS_STREAK_7 : POINTS_STREAK_30;
    const action =
      newStreak === 7 ? "streak_milestone_7" : "streak_milestone_30";
    await db.transaction(async (tx) => {
      await tx
        .insert(pointsLedger)
        .values({
          userId,
          sourceAction: action,
          points: bonus,
          description: `${newStreak}-day streak bonus`,
        });
      await tx
        .update(pointsAccount)
        .set({ totalPoints: sql`total_points + ${bonus}` })
        .where(eq(pointsAccount.userId, userId));
    });
    await redis.publish(
      `user:${userId}:gamification`,
      JSON.stringify({
        event: "streak_milestone",
        streak: newStreak,
        bonusPoints: bonus,
      }),
    );
  }
}
```

---

## Step 5: Register Worker Consumer

```typescript
// api/src/jobs/gamificationConsumer.ts
import { redis } from "@hakwa/redis";
import { workerPool } from "@hakwa/workers";

export async function startGamificationConsumer(): Promise<void> {
  while (true) {
    const entries = await redis.xread(
      "COUNT",
      10,
      "BLOCK",
      5000,
      "STREAMS",
      "gamification:events",
      "$",
    );
    if (!entries) continue;
    for (const [, messages] of entries) {
      for (const [id, fields] of messages) {
        await workerPool.run("gamificationProcessor", {
          ...parseFields(fields),
        });
        await redis.xack("gamification:events", "gamification-workers", id);
      }
    }
  }
}
```

Start alongside the API server in `api/src/index.ts`.

---

## Step 6: Verify

```bash
# 1. Complete a trip (triggers gamification:events stream)
PATCH /api/driver/trips/:tripId/complete { "actualDistanceKm": 5.0 }

# 2. Check gamification profile
GET /api/me/gamification
# → totalPoints: 10, currentStreak: 1

# 3. Check leaderboard
GET /api/gamification/leaderboard?week=$(date +%Y-%V)
# → rank 1 with 10 points

# 4. Check points history
GET /api/me/gamification/history
# → items[0].sourceAction = "trip_completed", points = 10
```
