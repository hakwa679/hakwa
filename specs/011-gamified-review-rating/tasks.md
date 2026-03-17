---
description: "Task list for Gamified Review & Rating System"
---

# Tasks: Gamified Review & Rating System

**Feature Branch**: `011-gamified-review-rating` **Input**: plan.md, spec.md,
data-model.md **Tech Stack**: TypeScript 5.x, Drizzle ORM, PostgreSQL, Redis
(pub/sub `review:revealed:{userId}`, cache `reputation:{userId}`),
`@hakwa/workers`, `@hakwa/notifications`, `gamification:events` Redis Stream

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- All paths relative to repo root

---

## Phase 1: Setup (Schema + Seed Data)

**Purpose**: Define all review tables, add `trip.completedAt`, add idempotency
constraint to `pointsLedger`, and seed tags before any review endpoint is built

- [ ] T001 Define `reviewTag` table (id, key varchar(60) UNIQUE, label
      varchar(80), icon varchar(10), direction
      `passenger_to_driver|driver_to_passenger|both`, sortOrder smallint
      default 0) in `pkg/db/schema/review.ts`
- [ ] T002 Define `tripReview` table (id, tripId FK→trip SET NULL,
      reviewerUserId FK→user SET NULL, revieweeUserId FK→user SET NULL,
      direction `passenger_to_driver|driver_to_passenger`, rating smallint CHECK
      1–5, comment text nullable, pointsAwarded integer default 0, submittedAt)
      with `UNIQUE(tripId, direction)` and indexes on `reviewerUserId`,
      `revieweeUserId`, `tripId`, `submittedAt` in `pkg/db/schema/review.ts`
- [ ] T003 [P] Define `tripReviewTag` join table (id, reviewId FK→tripReview
      CASCADE, tagId FK→reviewTag CASCADE) with `UNIQUE(reviewId, tagId)` in
      `pkg/db/schema/review.ts`
- [ ] T004 [P] Add `completedAt` timestamp column to `trip` table in
      `pkg/db/schema/trip.ts` (additive — nullable to preserve existing rows);
      ensure `tripService.ts` sets `completedAt = now()` at completion
- [ ] T005 [P] Add `UNIQUE(accountId, sourceAction, referenceId)` constraint to
      `pointsLedger` in `pkg/db/schema/gamification.ts` for idempotency guard;
      `referenceId` column added if not present
- [ ] T006 Export review entities from `pkg/db/schema/index.ts`; run `db-push`
      to apply schema changes
- [ ] T007 Implement `api/src/jobs/seedReviewTags.ts` —
      `INSERT INTO reviewTag ... ON CONFLICT (key) DO NOTHING` for all 15 tag
      rows from data-model; run as startup job in `api/src/index.ts`

---

## Phase 2: Foundational (Review Service + Points Logic)

**Purpose**: Core `submitReview` service function with atomic points award must
exist before any route can accept submissions

**⚠️ CRITICAL**: All user stories from US1 onward depend on this service being
correct

- [ ] T008 Implement `isRevealed(review, trip, counterpartExists)` helper in
      `api/src/services/reviewService.ts` — pure function: returns true if
      `(counterpartReview exists) OR (now() > trip.completedAt + reviewerWindowDuration)`
      where passenger window = 72 h, driver window = 24 h
- [ ] T009 Implement `calculateReviewPoints(rating, tagCount, hasComment)`
      utility in `api/src/services/reviewService.ts` — `basePoints = 10`;
      `tagBonus = tagCount >= 2 ? 5 : 0`; `commentBonus = hasComment ? 10 : 0`;
      return `basePoints + tagBonus + commentBonus`
- [ ] T010 Implement `submitReview(userId, tripId, payload)` in
      `api/src/services/reviewService.ts`: (1) verify trip `status = completed`
      and caller is passenger or driver on this trip, (2) check window not
      expired (else `REVIEW_WINDOW_CLOSED`), (3) validate tag keys against
      `reviewTag.direction`, (4) compute `pointsAwarded`, (5) begin transaction:
      `INSERT tripReview ON CONFLICT (tripId, direction) DO NOTHING` — if
      rowCount = 0 return 409 `REVIEW_ALREADY_SUBMITTED`; bulk-insert
      `tripReviewTag` rows; `UPDATE pointsAccount.totalPoints += pointsAwarded`;
      `INSERT pointsLedger (sourceAction = 'review_submitted', referenceId = tripReviewId) ON CONFLICT DO NOTHING`;
      (6) post-commit: `XADD gamification:events` event
      `{ type: 'review_submitted', userId, reviewId, tagCount, hasComment }` for
      badge evaluation; check if double-blind lifts and publish
      `review:revealed:{revieweeUserId}` if so

**Checkpoint**: Core review logic with atomic points and idempotency guard is
complete

---

## Phase 3: User Story 1 + 2 — Passenger Reviews Driver & Driver Reviews Passenger (Priority: P1) 🎯 MVP

**Goal**: Both review directions are accepted via
`POST /api/reviews/trips/:tripId`; correct window enforced; `trip_review`
created; points awarded; celebration animation plays.

**Independent Test**: Passenger submits rating-only review → `trip_review` row
with `direction = passenger_to_driver`, `pointsAwarded = 10`; driver submits
5-star + 2-tag review → `pointsAwarded = 15`; duplicate submit → 409.

- [ ] T011 [US1] [US2] Implement `POST /api/reviews/trips/:tripId` in
      `api/src/routes/reviews.ts` — require session; call `submitReview`; return
      `{ reviewId, pointsAwarded, directionContext }` for celebration animation
- [ ] T012 [P] [US1] [US2] Implement `GET /api/reviews/tags` in
      `api/src/routes/reviews.ts` — return all `reviewTag` rows; filter by
      `direction` query param (`passenger_to_driver` or `driver_to_passenger` or
      `both`) so mobile only receives relevant chips
- [ ] T013 [P] [US1] [US2] Build `ReviewCard.tsx` in
      `apps/mobile/rider/src/screens/TripComplete/ReviewCard.tsx` — three-step
      flow: Step 1 star row (tap → advance), Step 2 tag chips (loaded from
      `GET /api/reviews/tags?direction=passenger_to_driver`), Step 3 comment
      field (280 char limit, live counter) + Submit button; live points preview
      updating at each step; "Skip" link on Step 1 (dismisses and schedules
      reminder push in 6 h)
- [ ] T014 [P] [US1] [US2] Build mirror `ReviewCard.tsx` in
      `apps/mobile/driver/src/screens/TripComplete/ReviewCard.tsx` — same
      three-step flow with `direction = driver_to_passenger` tags; 24-hour
      window label

**Checkpoint**: User Story 1 + 2 complete — both review directions are
functional with correct points

---

## Phase 4: User Story 3 + 4 — Three-Step Flow + Points Calculation (Priority: P1)

**Goal**: Live points preview updates correctly at each step; `pointsAwarded`
stored on `trip_review` matches preview; 280-char input guard.

**Independent Test**: ReviewCard shows "10 pts" after star, "15 pts" after 2+
tags, "25 pts" after comment; `pointsAwarded` on `trip_review` matches those
exact values.

- [ ] T015 [US3] [US4] Implement
      `calculatePreviewPoints(step, selectedTagCount, hasComment)` selector in
      `apps/mobile/rider/src/screens/TripComplete/ReviewCard.tsx` — exported so
      unit-testable; ensure `pointsAwarded` sent in POST body matches
      server-computed value (server is authoritative; client is optimistic
      display only)
- [ ] T016 [P] [US3] Implement step-advance logic in `ReviewCard.tsx` — tapping
      any star auto-advances to Step 2 without "Next" tap; "Skip" on Step 2
      advances to Step 3 with empty tags; character count warning disables
      submit when comment > 280

**Checkpoint**: User Story 3 + 4 complete — stepwise UX flow and points schedule
are correct on both client and server

---

## Phase 5: User Story 5 — Double-Blind Reveal (Priority: P1)

**Goal**: `GET /api/reviews/trips/:tripId` filters reviews using `isRevealed()`
logic; reviews become visible when counterpart submits or window expires;
WebSocket event fires on reveal.

**Independent Test**: Passenger submits review; driver fetches trip reviews →
empty (window open, no driver review); driver submits → both reviews returned;
WebSocket `review.revealed` event emitted to both parties.

- [ ] T017 [US5] Implement `GET /api/reviews/trips/:tripId` in
      `api/src/routes/reviews.ts` — require session; load both `tripReview` rows
      for trip (and their tags); for each review call
      `isRevealed(review, trip, counterpartExists)` from caller's perspective;
      only return reviews where `isRevealed = true`
- [ ] T018 [P] [US5] Subscribe to `review:revealed:{userId}` Redis pub/sub in
      `api/src/websocket.ts` — push `review.revealed` event (`{ tripId }`) to
      user's WebSocket connection
- [ ] T019 [P] [US5] Handle `review.revealed` event in both mobile apps — show
      "Your review is now visible" in-app notification with link to trip review
      screen

**Checkpoint**: User Story 5 complete — double-blind reveal logic is implemented
and tested

---

## Phase 6: User Story 6 — Reviewer Badges (Priority: P2)

**Goal**: 5 reviewer badges (first_review, tagged_reviewer, dedicated_reviewer,
veteran_reviewer, perfect_streak_reviewer) awarded via gamification worker after
`review_submitted` event; idempotent.

**Independent Test**: `review_submitted` gamification event with `userId` →
badge worker evaluates reviewer counts from `tripReview` table → awards
`first_review` on first submission; all badge awards idempotent
(`INSERT INTO userBadge ON CONFLICT DO NOTHING`).

- [ ] T020 [US6] Seed reviewer and reputation badge rows into `badge` table:
      `first_review`, `tagged_reviewer` (5 tagged reviews), `dedicated_reviewer`
      (25 reviews), `veteran_reviewer` (100 reviews), `perfect_streak_reviewer`
      (7 consecutive reviewed trips), `top_rated_driver` (avg ≥ 4.8, 50+
      reviews), `consistent_driver` (50+ reviews, zero 1-star), plus any
      additional reputation badges
- [ ] T021 [US6] Extend `evaluateBadges` in
      `pkg/workers/src/workers/gamificationProcessor.ts` to handle
      `review_submitted` events — query `tripReview` counts by `reviewerUserId`;
      evaluate all reviewer badge conditions; award idempotently

**Checkpoint**: User Story 6 complete — reviewer badges awarded correctly via
existing gamification worker

---

## Phase 7: User Story 7 — Reputation Display on Profiles (Priority: P2)

**Goal**: `GET /api/users/:id/reputation` returns avg rating, top tags, comment
snippets; only includes revealed reviews; result cached in Redis; passenger
rating shown on booking dispatch.

**Independent Test**: 30 revealed reviews for a driver →
`GET /api/users/:id/reputation` returns avg, top-3 tags, 5 comments; unrevealed
reviews excluded; Redis TTL cache `reputation:{userId}` of 5 min.

- [ ] T022 [US7] Implement `getUserReputation(userId, callerRole)` in
      `api/src/services/reviewService.ts` — check Redis `reputation:{userId}`
      cache (TTL 5 min); on miss: aggregate revealed `tripReview` rows by
      `revieweeUserId`; compute `AVG(rating)`, count per star, top-5 cited tags
      (count descending), last 5 comments (anonymous — "A passenger"); write to
      cache; return
- [ ] T023 [P] [US7] Implement `GET /api/users/:id/reputation` in
      `api/src/routes/reviews.ts` — require session; calls `getUserReputation`;
      driver-only fields gated by reviewee `role = driver`
- [ ] T024 [P] [US7] Invalidate Redis `reputation:{userId}` cache in
      `submitReview` after reveal condition fires in `reviewService.ts` — use
      `redis.del('reputation:{userId}')`
- [ ] T025 [P] [US7] Include `passengerRating` (avg + count from revealed
      reviews) in booking request dispatch payload in
      `api/src/services/bookingService.ts` — show "New rider" if fewer than 3
      revealed reviews

**Checkpoint**: User Story 7 complete — reputation scores available on profiles
and booking dispatch

---

## Phase 8: User Story 8 + 9 — Driver Reputation Dashboard + Reputation Badges (Priority: P2)

**Goal**: Driver reputation screen shows monthly chart, tag annotations,
actionable feedback; reputation badges awarded post-review via gamification
worker.

**Independent Test**: Driver with 5 `late_arrival` tags in last 30 days →
reputation dashboard returns annotation; `top_rated_driver` badge check
evaluates `AVG(rating)` over 50+ reviews.

- [ ] T026 [US8] Implement `GET /api/reviews/me/reputation-dashboard` in
      `api/src/routes/reviews.ts` — driver session required; monthly avg rating
      going back 6 months (GROUP BY month on `submittedAt`); top-cited negative
      tags (for annotation); top-cited positive tags; badge list with award
      dates
- [ ] T027 [P] [US8] Implement `buildAnnotations(negativeTags)` in
      `reviewService.ts` — for each tag with count ≥ 5 in last 30 days, build
      actionable annotation text (e.g. "5 recent passengers mentioned 'Late
      arrival'")
- [ ] T028 [P] [US9] Extend `evaluateBadges` in `gamificationProcessor.ts` for
      reputation badges — evaluate `top_rated_driver` (avg ≥ 4.8 over 50+
      revealed reviews), `consistent_driver` (50+ reviews, zero 1-star) after
      each `review_submitted` event against reviewee's stats

**Checkpoint**: User Story 8 + 9 complete — driver reputation dashboard and
reputation badge awards are functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Error codes: register `REVIEW_ALREADY_SUBMITTED`,
      `REVIEW_WINDOW_CLOSED`, `REVIEW_INVALID_TAG`, `REVIEW_INVALID_DIRECTION`
      in `@hakwa/errors`
- [ ] T030 [P] Schedule reminder push notification 6 hours after trip completion
      for passengers who skipped review — use `node-cron` daily check or Redis
      key with TTL in `api/src/jobs/reviewReminder.ts`
- [ ] T031 [P] Ensure `tripService.ts` sets `trip.completedAt = now()` when
      status transitions to `completed` (required for window expiry
      calculations)

---

## Dependencies

```
Phase 1 (Schema + Seed) → Phase 2 (submitReview service) → Phase 3 (US1+US2 routes)
US3+US4 (points flow) depends on Phase 2 service being correct
US5 (double-blind) depends on Phase 3 (reviews must exist to be revealed)
US6 (reviewer badges) depends on Phase 3 (review_submitted gamification event)
US7 (reputation display) depends on Phase 3 (revealed reviews must exist)
US8 (reputation dashboard) depends on US7 (reputation aggregate exists)
US9 (reputation badges) depends on US7 (avg rating computable)
```

## Parallel Execution Examples

- T003 + T004 + T005 can run in parallel (separate schema changes)
- T011 + T012 can run in parallel (POST endpoint vs GET tags endpoint)
- T013 + T014 can run in parallel (rider ReviewCard vs driver ReviewCard)
- T022 + T023 + T024 + T025 can run in parallel (cache, endpoint, invalidation,
  booking dispatch)
- T027 + T028 can run in parallel (annotations vs reputation badge evaluation)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T014) — both review directions with
  points and celebration UI
- **MVP+**: Add Phase 4 + Phase 5 (T015–T019) — live points preview +
  double-blind reveal
- **Full P2**: Add Phase 6 + Phase 7 (T020–T025) — reviewer badges + reputation
  display
- **Complete**: Add Phase 8 + Polish (T026–T031) — driver dashboard + reputation
  badges

**Total tasks**: 31 | **Parallelizable**: 13 | **User stories**: 9
