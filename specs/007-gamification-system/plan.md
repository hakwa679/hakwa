# Implementation Plan: Gamification System

**Branch**: `007-gamification-system` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from `/specs/007-gamification-system/spec.md`

---

## Summary

Gamification system for passengers and operators (vehicle operators: drivers,
captains, bikers, pilots, etc.): trip completion awards points (10/trip),
referral rewards (50 for signup + 100 for first trip, capped at 20 referrals),
level progression (derived from lookup table, no stored field), badge awards
(idempotent via `UNIQUE (userId, badgeId)`), daily streak tracking (Fiji local
date, milestones at 7 and 30 days), and a Redis Sorted Set leaderboard (weekly).
All side effects run **after** the primary transaction commits via a Redis
Stream `gamification:events` consumed by a `@hakwa/workers` task, ensuring
gamification failures never roll back business logic.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db`, `@hakwa/redis`, `@hakwa/workers`,
`@hakwa/notifications`, `@hakwa/core`  
**Storage**: PostgreSQL (`pointsAccount`, `pointsLedger`, `level`, `badge`,
`userBadge`, `referral`, `streakCheckpoint`); Redis (leaderboard Sorted Set,
gamification:events Stream, pub/sub channels)  
**Testing**: Vitest; mock Redis Stream; mock notifications; idempotency tests
for badge and referral  
**Target Platform**: Node.js API; React Native Expo (Rider App, Driver App);
React + Vite (Rider Portal)  
**Performance Goals**: Gamification processing < 500 ms post-trip; leaderboard
read < 50 ms; profile load < 100 ms  
**Constraints**: Gamification MUST NOT block or roll back trip completion;
badges are idempotent; referral cap = 20  
**Scale/Scope**: Phase 1 — thousands of users; Redis leaderboard handles
concurrent updates at O(log N)

---

## Constitution Check

- [x] **I. Package-First** — Gamification constants in `@hakwa/core`; processor
      in `@hakwa/workers`; all DB ops via `@hakwa/db`.
- [x] **II. Type Safety** — `pointsSourceActionEnum` pgEnum;
      `Badge = typeof badge.$inferSelect`; worker message schema typed.
- [x] **III. Security** — Profile endpoints return only the authenticated user's
      data; leaderboard shows names only (no full user data); referral code is
      public but referral linkage is server-side only.
- [x] **IV. Schema Contract** — `pointsSourceActionEnum`,
      `UNIQUE (userId, badgeId)` confirmed in `pkg/db/schema/gamification.ts`;
      `db-push` before worker code.
- [x] **V. Real-Time** — `user:{userId}:gamification` pub/sub channel for
      points, level-up, badge, streak events; no polling.
- [x] **VI. Redis Package** — `ZADD`, `EXPIRE`, `PUBLISH`, `XADD`, `XREAD` all
      via `@hakwa/redis` wrapper.
- [x] **VII. Gamification** — Trip completion fires points, streak, badge,
      leaderboard. Referral fires on signup + first trip. Cap prevents abuse.
      Levels derived from lookup table (admin configurable threshold).
- [x] **VIII. Concurrency Safety** — Points award inside Drizzle transaction
      (`INSERT + UPDATE totalPoints`); badge award uses
      `ON CONFLICT DO NOTHING`; referral uses `UNIQUE (refereeId)` to prevent
      double-linkage.
- [x] **X. Worker-Thread Concurrency** — All gamification processing in
      `@hakwa/workers`; Redis Stream acts as the queue.
- [x] **XI. Unified Error Handling** — Worker catches per-event errors; failed
      events are logged but do not stop stream processing.
- [x] **XII. Frontend Architecture** — Rider app uses `useGamificationProfile`
      TanStack Query hook; WebSocket hook for real-time events; celebration
      animation on level-up and badge.
- [x] **XIV. Notification System** — `@hakwa/notifications` push for all
      gamification milestones.
- [x] **XV. UI Design System** — Level icons and badge assets served from
      `iconUrl`; progress bar uses `@hakwa/tokens`; streak flame icon from
      `@hakwa/ui-native`.
- [x] **XVI. UX Principles** — Silent points credit is not acceptable (per
      spec); in-app event fires immediately after Redis publish reaches
      WebSocket server.

---

## Project Structure

### Documentation (this feature)

```text
specs/007-gamification-system/
├── plan.md          ← this file
├── research.md      ← ledger strategy, level computation, badge idempotency, hook placement, referral cap, streak algo, leaderboard
├── data-model.md    ← all tables, enum values, Redis structures
├── quickstart.md    ← enum confirm → constants → event publish → worker → consumer → verify
└── contracts/
    └── rest-api.md  ← profile, history, leaderboard, referral, WebSocket events
```

### Source Code

```text
pkg/
├── core/src/gamificationConstants.ts   ← POINTS_PER_TRIP, MAX_REFERRAL_REWARDS, STREAK_MILESTONES, etc.
└── workers/src/workers/
    └── gamificationProcessor.ts        ← handleTripCompleted, updateStreak, evaluateBadges, checkReferralRewards

api/
└── src/
    ├── jobs/
    │   └── gamificationConsumer.ts     ← XREAD loop → dispatch to worker pool
    ├── services/
    │   └── tripService.ts              ← post-commit: XADD to gamification:events stream
    └── routes/
        ├── meGamification.ts           ← GET /me/gamification, GET /me/gamification/history
        ├── leaderboard.ts              ← GET /gamification/leaderboard
        └── referrals.ts                ← GET /me/referrals
```
