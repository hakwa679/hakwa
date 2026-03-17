---
description: "Task list for Gamification System"
---

# Tasks: Gamification System

**Feature Branch**: `007-gamification-system` **Input**: plan.md, spec.md,
data-model.md **Tech Stack**: TypeScript 5.x, Drizzle ORM, PostgreSQL, Redis
(Sorted Set, Streams, pub/sub), `@hakwa/workers`, `@hakwa/notifications`,
`@hakwa/core`

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm schema enums, seed badge/level data, and establish
constants before worker code

- [x] T001 Confirm `pointsSourceActionEnum` values (`trip_completed`,
      `referral_signup`, `referral_trip`, `badge_earned`, `streak_milestone_7`,
      `streak_milestone_30`, `map_contribution`, `review_submitted`) in
      `pkg/db/schema/gamification.ts`
- [x] T002 Confirm `UNIQUE (userId, badgeId)` constraint on `userBadge` and
      `UNIQUE (refereeId)` on `referral` in `pkg/db/schema/gamification.ts`
- [x] T003 [P] Create `pkg/core/src/gamificationConstants.ts` with
      `POINTS_PER_TRIP`, `REFERRAL_SIGNUP_POINTS` (50), `REFERRAL_TRIP_POINTS`
      (100), `MAX_REFERRAL_REWARDS` (20), `STREAK_BONUS_7` (25),
      `STREAK_BONUS_30` (100), `STREAK_MILESTONES`
- [x] T004 [P] Seed initial `level` rows (Level 1 "Novice" 0pts, Level 2
      "Explorer" 100pts, Level 3 "Navigator" 300pts, etc.) and seed initial
      `badge` rows (`first_trip`, `ten_trips`, `top_referrer`) in database seed
      script

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gamification event pipeline (Redis Stream → worker consumer) must
exist before any gamification event can be processed

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement `XADD` publish in `api/src/services/tripService.ts` — after
      primary trip completion transaction commits, publish
      `{ type: 'trip_completed', userId, tripId, timestamp }` to Redis Stream
      `gamification:events`
- [x] T006 Implement `gamificationConsumer.ts` in
      `api/src/jobs/gamificationConsumer.ts` — `XREAD` loop on
      `gamification:events` stream; dispatch each event type to
      `gamificationProcessor` worker pool
- [x] T007 Implement `gamificationProcessor.ts` in
      `pkg/workers/src/workers/gamificationProcessor.ts` — route
      `trip_completed`, `user_registered`, `first_trip_completed`,
      `referral_used` event types to respective handlers
- [x] T008 [P] Implement real-time notify helper in `gamificationProcessor.ts` —
      publish to `user:{userId}:gamification` Redis pub/sub channel after each
      award
- [x] T009 [P] Subscribe to `user:{userId}:gamification` in
      `api/src/websocket.ts` — push gamification events to passenger/driver
      WebSocket clients
- [x] T010 Register gamification routes and start gamification consumer in
      `api/src/index.ts`

**Checkpoint**: Foundation complete — event pipeline, worker dispatch, and
real-time WebSocket relay are operational

---

## Phase 3: User Story 1 — Earn Points for Completing a Trip (Priority: P1) 🎯 MVP

**Goal**: Trip completion awards 10 points via Redis Stream event; passenger
sees in-app notification; `pointsLedger` and `totalPoints` updated.

**Independent Test**: After `trip_completed` event is processed → `pointsLedger`
has a `trip_completed` entry with 10 points; `pointsAccount.totalPoints`
incremented; `user:{userId}:gamification` channel receives `points_awarded`
event; in-app notification delivered.

- [x] T011 [US1] Implement `handleTripCompleted` in `gamificationProcessor.ts` —
      in Drizzle transaction: insert `pointsLedger` row (`trip_completed`,
      `POINTS_PER_TRIP`),
      `UPDATE pointsAccount SET totalPoints += points WHERE userId = ?`; then
      publish gamification event and `@hakwa/notifications` push
- [x] T012 [P] [US1] Implement `GET /api/me/gamification` in
      `api/src/routes/meGamification.ts` — return
      `{ totalPoints, currentLevel, nextLevel, pointsToNext, referralCode, badges, currentStreak }`
- [ ] T013 [P] [US1] Build `GamificationProfileCard` in
      `apps/mobile/rider/src/components/GamificationProfileCard.tsx` — shows
      total points, level name, level icon, and progress bar to next level

**Checkpoint**: User Story 1 complete — trips award points with real-time in-app
notification

---

## Phase 4: User Story 2 — Referral Code Sign-Up and Reward (Priority: P1)

**Goal**: Referral code at sign-up creates a referral record and awards
`referral_signup` points to referrer; first trip by referee awards
`referral_trip` points; cap enforced at 20 referrals.

**Independent Test**: Sign up with `referralCode=XXXXX` → `referral` row created
→ referrer gets 50-pt `referral_signup` ledger entry; referee completes first
trip → referrer gets 100-pt `referral_trip` ledger entry; sign up as 21st
referee → referral record created but no points awarded.

- [ ] T014 [US2] Accept optional `referralCode` on `POST /auth/sign-up/email` in
      `pkg/auth/lib/auth.ts` — after account creation, if code provided, look up
      `pointsAccount.referralCode`, create `referral` row (UNIQUE on
      `refereeId`), publish `referral_used` event to `gamification:events`
- [ ] T015 [US2] Implement `handleReferralUsed` in `gamificationProcessor.ts` —
      award `referral_signup` points to referrer if
      `referrerReferralCount < MAX_REFERRAL_REWARDS`; notify referrer of
      cap-reached if limit hit
- [ ] T016 [US2] Publish `first_trip_completed` event to `gamification:events`
      in `tripService.ts` when a user's `pointsLedger` has no prior
      `trip_completed` entries (first trip detection)
- [ ] T017 [US2] Implement `handleFirstTripCompleted` in
      `gamificationProcessor.ts` — look up active `referral` for referee, award
      `referral_trip` points (100) to referrer if under cap
- [ ] T018 [P] [US2] Display referral code and referral count on
      `GamificationProfileCard` in
      `apps/mobile/rider/src/components/GamificationProfileCard.tsx`

**Checkpoint**: User Story 2 complete — referral flow with signup and first-trip
rewards, and cap enforcement, is functional

---

## Phase 5: User Story 3 — Level Progression (Priority: P2)

**Goal**: After any points credit, user's computed level is checked; crossing a
threshold triggers level-up notification; profile shows level progress bar.

**Independent Test**: `GET /api/me/gamification` returns correct `currentLevel`
computed from
`SELECT * FROM level WHERE minPoints <= totalPoints ORDER BY minPoints DESC LIMIT 1`;
when `totalPoints` crosses next level threshold, `level_up` notification is
sent.

- [ ] T019 [US3] Implement level computation in `gamificationProcessor.ts` —
      after every points award, query `level` table for new level; if
      `newLevel.number > previousLevel.number`, publish `level_up` event and
      send `@hakwa/notifications` push
- [ ] T020 [US3] Update `GET /api/me/gamification` to include
      `{ currentLevel: { number, name, iconUrl }, nextLevel: { name, minPoints }, progressPercent }`
      in `api/src/routes/meGamification.ts`
- [ ] T021 [P] [US3] Build level progress bar in `GamificationProfileCard.tsx` —
      animated fill from `progressPercent`; show level-up celebration animation
      on `level_up` WebSocket event

**Checkpoint**: User Story 3 complete — level progression with real-time
level-up notification is functional

---

## Phase 6: User Story 4 — Badge Awards (Priority: P2)

**Goal**: `first_trip` badge awarded on first trip completion; `userBadge`
insert is idempotent (ON CONFLICT DO NOTHING); badge visible on profile;
notification sent once.

**Independent Test**: First `trip_completed` event → `userBadge` row for
`first_trip` created; second trip event → no duplicate row;
`GET /api/me/gamification` includes badge in `badges` array.

- [ ] T022 [US4] Implement `evaluateBadges` in `gamificationProcessor.ts` — load
      `badge` table, evaluate each badge's `criteria` JSONB against user's
      current stats; for each earned badge:
      `INSERT INTO userBadge ON CONFLICT (userId, badgeId) DO NOTHING`; only
      notify if newly inserted (use rowCount check)
- [ ] T023 [US4] Award `badge_earned` points entry from `badge.bonusPoints` on
      first-time badge award in `evaluateBadges`
- [ ] T024 [P] [US4] Display badge grid on profile in
      `apps/mobile/rider/src/screens/ProfileScreen.tsx` — badge icons with
      earned/locked states from `GET /api/me/gamification`

**Checkpoint**: User Story 4 complete — idempotent badge awards with profile
display are functional

---

## Phase 7: User Story 5 — Daily Activity Streak (Priority: P3)

**Goal**: Consecutive daily trips increment `currentStreak`; missing a day
resets to 0; 7-day and 30-day milestones award bonus points.

**Independent Test**: Complete trip day 1 → streak = 1; trip day 2 → streak = 2;
no trip day 3 → streak = 0; reach day 7 → `streak_milestone_7` ledger entry (25
pts) inserted.

- [ ] T025 [US5] Implement `updateStreak` in `gamificationProcessor.ts` —
      compare last `streakCheckpoint.checkpointDate` with today (Fiji local date
      UTC+12); if same day = no-op; if previous day = increment `currentStreak`;
      if older = reset to 1; check milestones (7, 30) and insert bonus ledger
      entry if reached
- [ ] T026 [US5] Update `GET /api/me/gamification` to include `currentStreak`
      and `streakMilestones` in `api/src/routes/meGamification.ts`
- [ ] T027 [P] [US5] Display streak flame counter on
      `GamificationProfileCard.tsx` — current streak count with flame icon from
      `@hakwa/ui-native`

**Checkpoint**: User Story 5 complete — daily streak tracking with milestone
bonuses is functional

---

## Phase 8: User Story 6 — Weekly Leaderboard (Priority: P3)

**Goal**: After each trip completion, leaderboard Redis Sorted Set updated;
weekly leaderboard endpoint returns top 20 with names; leaderboard resets each
Monday.

**Independent Test**: `ZADD leaderboard:weekly:{weekKey} <score> <userId>`
called after trip points; `GET /api/gamification/leaderboard` returns top 20
users with name and points; Sorted Set expires at end of week.

- [ ] T028 [US6] Implement leaderboard update in `handleTripCompleted` in
      `gamificationProcessor.ts` —
      `ZADD leaderboard:weekly:{weekKey} INCR {points} {userId}` where
      `weekKey = ISO-week string`; set `EXPIREAT` to next Monday midnight Fiji
      time
- [ ] T029 [US6] Implement `GET /api/gamification/leaderboard` in
      `api/src/routes/leaderboard.ts` —
      `ZREVRANGE leaderboard:weekly:{weekKey} 0 19 WITHSCORES`; enrich with user
      names from DB; return top 20
- [ ] T030 [P] [US6] Build `LeaderboardScreen.tsx` in
      `apps/mobile/rider/src/screens/LeaderboardScreen.tsx` — ranked list with
      position, name, and weekly points; highlight current user's row

**Checkpoint**: User Story 6 complete — weekly leaderboard with Redis Sorted Set
is functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Implement `GET /api/me/gamification/history` in
      `api/src/routes/meGamification.ts` — paginated `pointsLedger` entries
      newest-first with source action label and reference
- [ ] T032 [P] Validate gamification failures do not affect trip completion —
      wrap all gamification processing in try/catch in
      `gamificationProcessor.ts`; log errors but do not re-throw to stream
      consumer
- [ ] T033 [P] Referral code generation — on `pointsAccount` creation use
      `nanoid(12)` to generate unique `referralCode`; retry on collision (rare)

---

## Dependencies

```
Phase 1 (Schema/Constants) → Phase 2 (Pipeline) → Phase 3–8 (User Stories)
US1 (trip points) is foundational — all other gamification stories build on it
US2 (referral) independent of US3-US6 after Phase 2
US3 (levels) depends on US1 (needs points)
US4 (badges) depends on US1 (needs trip count)
US5 (streaks) depends on US1 (needs daily trip events)
US6 (leaderboard) depends on US1 (needs weekly trip points)
```

## Parallel Execution Examples

- T003 + T004 can run in parallel (constants vs seed data)
- T005 + T006 + T007 can run in parallel (publish vs consumer vs processor)
- T008 + T009 can run in parallel (publish vs subscribe)
- T023 + T024 can run in parallel (points vs UI)
- T027 + T028 can run in parallel (streak UI vs leaderboard update)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T013) — trip points + real-time
  notification
- **MVP+**: Add Phase 4 (T014–T018) — referral code rewards
- **Full P2**: Add Phase 5 + 6 (T019–T024) — levels + badges
- **Complete**: Add Phase 7 + 8 + Polish (T025–T033)

**Total tasks**: 33 | **Parallelizable**: 13 | **User stories**: 6
