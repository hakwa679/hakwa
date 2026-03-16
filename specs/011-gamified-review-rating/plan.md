# Implementation Plan: Gamified Review & Rating System

**Feature Branch**: `011-gamified-review-rating`  
**Spec**: [spec.md](spec.md)  
**Created**: 2026-03-16

---

## Summary

Adds a post-trip review system with progressive rewards, double-blind reveal,
and reputation scores. Passengers have a 72-hour window; drivers 24 hours.
Reviews are hidden from the reviewee until both parties have submitted or the
counterpart's window expires — computed at the API layer with no stored flag.
Points are awarded atomically within the review submission transaction (5/8/12
based on completeness) using the
`UNIQUE(account_id, source_action, reference_id)` idempotency guard added to
`pointsLedger`. Badge evaluation is deferred to the Spec 007 gamification worker
via `gamification:events` Redis Stream post-commit.

---

## Technical Context

| Concern                     | Resolution                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Double-blind reveal         | Computed at API read time using `trip.completedAt` + counterpart review presence; no stored flag                    |
| Review window expiry        | Server-side check: `now() > trip.completedAt + window`; returns 410 `REVIEW_WINDOW_CLOSED`                          |
| Duplicate submit prevention | `UNIQUE(trip_id, direction)` DB constraint → 409 `REVIEW_ALREADY_SUBMITTED`                                         |
| Points award                | Inline in review transaction; `UNIQUE(account_id, source_action, reference_id)` on `pointsLedger` guards re-trigger |
| Badge evaluation            | Post-commit `review_submitted` event → `gamification:events` Redis Stream → Spec 007 worker                         |
| Reputation score            | `AVG(rating WHERE isRevealed)` computed at query time; Redis cache `reputation:{userId}` TTL 5min                   |
| Tag validation              | Server-side check against `review_tag` lookup; direction mismatch → 422 `REVIEW_INVALID_TAG`                        |
| DB schema                   | 3 new tables: `reviewTag`, `tripReview`, `tripReviewTag`; additive `trip.completedAt` column                        |
| Seed data                   | 15 reaction tags seeded via `api/src/jobs/seedReviewTags.ts`                                                        |
| Package placement           | Routes → `api/src/routes/reviews.ts`; service → `api/src/services/reviewService.ts`                                 |

---

## Constitution Check

| Principle                   | Ref    | Status | Notes                                                                                                                                          |
| --------------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Auth required            | FR-001 | [x]    | All `/api/v1/reviews/*` endpoints use `requireAuth`; `GET /users/:id/reputation` also authenticated                                            |
| II. TypeScript strict       | FR-002 | [x]    | `ReviewDirection`, `ReviewTagKey`, `SubmitReviewRequest` types in `@hakwa/types`                                                               |
| III. Drizzle schema         | FR-003 | [x]    | `reviewTag`, `tripReview`, `tripReviewTag` in `pkg/db/schema/review.ts`; exported from `@hakwa/db`                                             |
| IV. AppError                | FR-004 | [x]    | All 9 error codes (`REVIEW_ALREADY_SUBMITTED`, `REVIEW_WINDOW_CLOSED`, etc.) in `@hakwa/errors`                                                |
| V. Redis pub/sub real-time  | FR-005 | [x]    | `review:revealed:{userId}` publish when both reviews submitted; WebSocket relays to rider/driver                                               |
| VI. Redis Stream async work | FR-006 | [x]    | `gamification:events` XADD post-commit for badge evaluation; reputation cache invalidation                                                     |
| VII. Gamification           | FR-007 | [x]    | Points awarded in-transaction (5/8/12); 8 new badge triggers via gamification worker; Redis leaderboard updated via existing Spec 007 pipeline |
| VIII. Idempotency           | FR-008 | [x]    | `UNIQUE(trip_id, direction)` on `tripReview`; `UNIQUE(account_id, source_action, reference_id)` on `pointsLedger`                              |
| IX. Cursor pagination       | FR-009 | [x]    | `GET /reviews/trips/:tripId/mine` is non-paginated (at most 2 records); `GET /users/:id/reputation/history` paginates by `submittedAt` cursor  |
| X. Worker CPU offload       | FR-010 | [x]    | Badge evaluation handled by existing Spec 007 gamification worker; no new heavy computation in API handler                                     |
| XI. AppError codes          | FR-011 | [x]    | All codes registered in `@hakwa/errors` with HTTP status and machine key                                                                       |
| XII. Mobile sessions        | FR-012 | [x]    | Role derived from session (`passenger` vs `driver`) determines review direction and window                                                     |
| XIII. Fare integrity        | FR-013 | N/A    | Review system does not touch fare or wallet                                                                                                    |
| XIV. Notifications          | FR-014 | [x]    | Post-trip push notification prompts review; `review:revealed` event triggers "Your review is now visible" push                                 |
| XV. Map integration         | FR-015 | N/A    | No map features in review system                                                                                                               |
| XVI. ODbL compliance        | FR-016 | N/A    | No map contributions                                                                                                                           |
| XVII. Schema migrations     | FR-017 | [x]    | `db-push` applies review tables and `trip.completedAt` column additively; `seedReviewTags.ts` run post-migration                               |

---

## Project Structure

```
pkg/
  db/
    schema/
      review.ts          ← reviewTag, tripReview, tripReviewTag
      gamification.ts    ← pointsLedger gains UNIQUE(accountId, sourceAction, referenceId)
      trip.ts            ← trip gains completedAt timestamp column

api/
  src/
    routes/
      reviews.ts         ← GET /tags, POST /trips/:id, GET /trips/:id/mine, GET /users/:id/reputation
    services/
      reviewService.ts   ← submitReview, getTags, getTripReviews, getUserReputation, isRevealed()
    jobs/
      seedReviewTags.ts  ← seeds 15 review_tag rows onConflictDoNothing

apps/
  mobile/
    rider/
      src/
        screens/
          TripComplete/
            ReviewCard.tsx       ← star → tags → comment → submit; celebration animation
    driver/
      src/
        screens/
          TripComplete/
            ReviewCard.tsx       ← symmetric (driver_to_passenger direction)
```
