## Backend Quick Validation

1. Start API and ensure review tags are seeded on boot.
2. Submit a passenger review with stars only and verify points = 10.
3. Submit a driver review with 2 tags and verify points = 15.
4. Submit with 2 tags + comment and verify points = 25.
5. Confirm `GET /api/v1/reviews/trip/:tripId` hides counterpart until
   submit/expiry.
6. Confirm `GET /api/v1/reviews/me/dashboard` returns monthly averages, tags,
   and annotations.

## Jobs

- Review reminder: runs hourly and dispatches reminders 6h before expiry.
- Weekly review mission reset: runs weekly (Fiji Monday boundary).

## Mobile Scaffolding

- Passenger review card scaffold:
  `apps/mobile/passenger/src/screens/TripComplete/ReviewCard.tsx`
- Driver review card scaffold:
  `apps/mobile/driver/src/screens/TripComplete/ReviewCard.tsx`
- Shared flow logic: `pkg/ui-native/src/review/reviewFlow.ts`

# Quickstart: Gamified Review & Rating System

## Prerequisites

- Spec 007 (gamification) schema and worker deployed (`pointsLedger`, `badge`,
  `gamification:events` Redis Stream)
- Spec 003/004 (trip) schema applied (`trip` table exists)
- `@hakwa/db`, `@hakwa/redis` packages built

---

## Step 1: Extend Trip Table

Add `completedAt` column to the `trip` table:

```typescript
// pkg/db/schema/trip.ts  — add inside the trip table definition
completedAt: timestamp('completed_at'),
```

Add `UNIQUE(account_id, source_action, reference_id)` idempotency constraint to
`pointsLedger`:

```typescript
// pkg/db/schema/gamification.ts
// In the pointsLedger table definition, add:
}, (table) => ({
  idempotencyIdx: uniqueIndex('points_ledger_idempotency_idx')
    .on(table.accountId, table.sourceAction, table.referenceId),
}));
```

Apply:

```bash
cd pkg/db && npm run db-push
```

---

## Step 2: Add Review Schema

Create `pkg/db/schema/review.ts`:

- `reviewTag` (lookup, seeded at deploy)
- `tripReview`
- `tripReviewTag`

Export from `pkg/db/schema/index.ts`:

```typescript
export * from "./review";
```

Apply + seed:

```bash
cd pkg/db && npm run db-push
npx tsx api/src/jobs/seedReviewTags.ts
```

Seed file:

```typescript
// api/src/jobs/seedReviewTags.ts
const TAGS = [
  {
    key: "safe_driver",
    label: "Safe driver",
    icon: "🛡️",
    direction: "passenger_to_driver",
    sortOrder: 1,
  },
  {
    key: "friendly",
    label: "Friendly",
    icon: "😊",
    direction: "both",
    sortOrder: 2,
  },
  {
    key: "on_time",
    label: "On time",
    icon: "⏱️",
    direction: "passenger_to_driver",
    sortOrder: 3,
  },
  {
    key: "clean_car",
    label: "Clean car",
    icon: "✨",
    direction: "passenger_to_driver",
    sortOrder: 4,
  },
  {
    key: "smooth_ride",
    label: "Smooth ride",
    icon: "🚗",
    direction: "passenger_to_driver",
    sortOrder: 5,
  },
  {
    key: "good_route",
    label: "Good route",
    icon: "📍",
    direction: "passenger_to_driver",
    sortOrder: 6,
  },
  {
    key: "professional",
    label: "Professional",
    icon: "👔",
    direction: "passenger_to_driver",
    sortOrder: 7,
  },
  {
    key: "quiet_respectful",
    label: "Gave me space",
    icon: "🤫",
    direction: "passenger_to_driver",
    sortOrder: 8,
  },
  {
    key: "late_arrival",
    label: "Late arrival",
    icon: "🕐",
    direction: "passenger_to_driver",
    sortOrder: 9,
  },
  {
    key: "polite",
    label: "Polite",
    icon: "🤝",
    direction: "driver_to_passenger",
    sortOrder: 1,
  },
  {
    key: "ready_on_time",
    label: "Ready on time",
    icon: "⏱️",
    direction: "driver_to_passenger",
    sortOrder: 2,
  },
  {
    key: "respectful",
    label: "Respectful",
    icon: "🫡",
    direction: "driver_to_passenger",
    sortOrder: 3,
  },
  {
    key: "kept_car_clean",
    label: "Kept car clean",
    icon: "✨",
    direction: "driver_to_passenger",
    sortOrder: 4,
  },
  {
    key: "good_directions",
    label: "Gave good directions",
    icon: "📍",
    direction: "driver_to_passenger",
    sortOrder: 5,
  },
  {
    key: "easy_to_find",
    label: "Easy to find",
    icon: "📌",
    direction: "driver_to_passenger",
    sortOrder: 6,
  },
];

await db.insert(reviewTag).values(TAGS).onConflictDoNothing();
```

---

## Step 3: Review Submission Route

```typescript
// api/src/routes/reviews.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  submitReview,
  getTags,
  getTripReviews,
  getUserReputation,
} from "../services/reviewService";

const router = Router();

router.get("/tags", requireAuth, getTags);
router.post("/trips/:tripId", requireAuth, submitReview);
router.get("/trips/:tripId/mine", requireAuth, getTripReviews);
router.get("/users/:userId/reputation", requireAuth, getUserReputation);

export default router;
```

Core `submitReview` function (key logic):

```typescript
// api/src/services/reviewService.ts (excerpt)
const REVIEW_POINTS = { star_only: 5, with_tags: 8, with_comment: 12 } as const;

export async function submitReview(req: Request, res: Response) {
  const { tripId } = req.params;
  const { rating, tags = [], comment } = req.body;
  const { userId, role } = session;

  const trip = await getTrip(tripId);
  if (!trip || !isParticipant(trip, userId))
    throw new AppError("REVIEW_TRIP_NOT_FOUND");
  if (trip.status !== "completed")
    throw new AppError("REVIEW_TRIP_NOT_COMPLETED");

  const direction =
    role === "passenger" ? "passenger_to_driver" : "driver_to_passenger";
  const windowHours = direction === "passenger_to_driver" ? 72 : 24;
  const windowClose = new Date(
    trip.completedAt!.getTime() + windowHours * 3600_000,
  );
  if (new Date() > windowClose) throw new AppError("REVIEW_WINDOW_CLOSED");

  const pointsLevel = comment
    ? "with_comment"
    : tags.length > 0
      ? "with_tags"
      : "star_only";
  const pointsAwarded = REVIEW_POINTS[pointsLevel];

  const review = await db.transaction(async (tx) => {
    const [review] = await tx
      .insert(tripReview)
      .values({
        tripId,
        direction,
        rating,
        comment: comment?.trim() ?? null,
        reviewerUserId: userId,
        revieweeUserId:
          direction === "passenger_to_driver"
            ? trip.driverId
            : trip.passengerId,
        pointsAwarded,
      })
      .returning();
    // catch UNIQUE violation → throw REVIEW_ALREADY_SUBMITTED

    if (tags.length > 0) {
      await tx
        .insert(tripReviewTag)
        .values(
          tags.map((key: string) => ({ reviewId: review.id, tagKey: key })),
        );
    }

    // Award points within same transaction
    await tx
      .insert(pointsLedger)
      .values({
        accountId: await getAccountId(tx, userId),
        sourceAction: "review_submitted",
        referenceId: review.id,
        points: pointsAwarded,
      })
      .onConflictDoNothing(); // idempotency guard

    return review;
  });

  // Post-commit: gamification event for badge evaluation
  await redis.xadd("gamification:events", "*", {
    type: "review_submitted",
    userId,
    reviewId: review.id,
    direction,
  });

  // If counterpart review now exists, publish reveal event
  const counterDirection =
    direction === "passenger_to_driver"
      ? "driver_to_passenger"
      : "passenger_to_driver";
  const counterReview = await getReviewByDirection(tripId, counterDirection);
  if (counterReview) {
    await redis.publish(
      `review:revealed:${counterReview.reviewerUserId}`,
      JSON.stringify({ tripId }),
    );
    await redis.publish(
      `review:revealed:${userId}`,
      JSON.stringify({ tripId }),
    );
  }

  return res.status(201).json({ review, pointsAwarded });
}
```

Mount in `api/src/index.ts`:

```typescript
app.use("/api/v1/reviews", reviewRouter);
```

---

## Step 4: Reputation Score Query

```typescript
// api/src/services/reviewService.ts
export async function getUserReputation(req: Request, res: Response) {
  const { userId } = req.params;
  const cacheKey = `reputation:${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  // Only count revealed reviews
  const reviews = await db
    .select({
      rating: tripReview.rating,
      submittedAt: tripReview.submittedAt,
      tripId: tripReview.tripId,
    })
    .from(tripReview)
    .where(eq(tripReview.revieweeUserId, userId));

  // Apply double-blind reveal filter (join trips for completedAt)
  const revealed = reviews.filter((r) => isRevealed(r));
  const avg =
    revealed.length > 0
      ? revealed.reduce((s, r) => s + r.rating, 0) / revealed.length
      : null;

  const result = { userId, averageRating: avg, reviewCount: revealed.length };
  await redis.set(cacheKey, JSON.stringify(result), "EX", 300); // 5-min cache

  return res.json(result);
}
```

---

## Step 5: Verify

```bash
# 1. Fetch tags (passenger → driver)
GET /api/v1/reviews/tags?direction=passenger_to_driver
# → array of tag objects with key, label, icon, sortOrder

# 2. Submit a review (star only → 5 points)
POST /api/v1/reviews/trips/:completedTripId
{ "rating": 4 }
# → 201, { review: { id, direction, rating, pointsAwarded: 5 }, pointsAwarded: 5 }

# 3. Verify points in ledger
GET /api/v1/me/gamification/history
# → entry with sourceAction: "review_submitted", points: 5

# 4. Duplicate submit is idempotent
POST /api/v1/reviews/trips/:completedTripId { "rating": 3 }
# → 409 REVIEW_ALREADY_SUBMITTED

# 5. Submit review with tags + comment (12 points)
POST /api/v1/reviews/trips/:anotherTripId
{ "rating": 5, "tags": ["safe_driver", "friendly", "clean_car"], "comment": "Great ride!" }
# → 201, pointsAwarded: 12

# 6. Check reputation score
GET /api/v1/reviews/users/:driverUserId/reputation
# → { averageRating: 4.5, reviewCount: 2 } (only revealed reviews counted)
```
