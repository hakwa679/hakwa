# Research: Gamification System

## Decision: Points as Append-Only Ledger

**Decision**: Points are stored in `pointsLedger` as immutable append-only
entries. The `pointsAccount.totalPoints` is maintained as a running aggregate —
updated after each ledger insert (in the same transaction). No need to recompute
total on every read.

**Rationale**: Hybrid approach: immutable audit trail from the ledger + fast
reads from the cached total. Total cannot drift from the ledger because both are
written in the same transaction.

**Alternatives considered**:

- Compute total from ledger on every read: Correct but adds a SUM aggregation to
  every profile load.
- Ledger only, no cached total: Same as above.

---

## Decision: Level Computation

**Decision**: Current level is computed from `level` lookup table (ordered by
`minPoints ASC`) as
`WHERE minPoints <= totalPoints ORDER BY minPoints DESC LIMIT 1`. No
`currentLevel` stored on `pointsAccount`. Level is derived on each read from the
`totalPoints` value.

**Rationale**: Admin can update level thresholds without needing a migration to
re-stamp all user rows. Read cost is a single keyed lookup against a small table
(less than 20 levels). Stale data is impossible.

**Alternatives considered**:

- Stored `currentLevel` field: Fast read but requires background job to update
  when thresholds change.
- Materialised view: Over-engineered for Phase 1.

---

## Decision: Badge Idempotency

**Decision**: `userBadge` table has a `UNIQUE (userId, badgeId)` constraint.
Badge award uses `INSERT ... ON CONFLICT DO NOTHING`. Returns zero rows on
duplicate — no error, no duplicate badge.

**Rationale**: Idempotent badge award is required to support re-evaluation of
badge eligibility on every gamification hook fire without risking duplicates.

**Alternatives considered**:

- Pre-check `SELECT EXISTS` before insert: TOCTOU race; unique constraint is
  safer.

---

## Decision: Gamification Hook Placement

**Decision**: Gamification side effects run **after** the primary transaction
commits (post-commit hook). The booking/trip service fires a Redis Stream event
`gamification:events` after the DB transaction succeeds. A dedicated
`@hakwa/workers` task consumes the stream and processes badge checks, streak
updates, and level notifications.

**Rationale**: Any gamification failure must not roll back a trip completion or
wallet credit. Decoupling via Redis Stream ensures primary business logic is
always durable.

**Alternatives considered**:

- Inline in the trip completion transaction: A badge check failure could roll
  back the fare split — unacceptable.
- Outbox table (write inside transaction, poll outside): More reliable but
  over-engineered; Redis Stream is sufficient for Phase 1.

---

## Decision: Referral Cap

**Decision**: The referral cap (maximum referrals that earn points) is a
configurable constant in `@hakwa/core`: `MAX_REFERRAL_REWARDS = 20`. When
`referral.rewardCount >= MAX_REFERRAL_REWARDS` for a referrer, the
`referral_signup` and `referral_trip` points are skipped (no error to new user;
referrer receives a notification that cap was reached).

**Rationale**: Prevents gamification abuse where a single user creates many fake
accounts to farm referral points.

---

## Decision: Streak Algorithm

**Decision**: `streakCheckpoint` stores the last activity date per user. The
streak computation algorithm:

1. On each trip completion, compare `today` (Fiji date) to `lastActivityDate`.
2. If `today = lastActivityDate + 1 day` → increment `currentStreak`.
3. If `today = lastActivityDate` → no change (already credited today).
4. Otherwise → reset `currentStreak = 1`.
5. Update `lastActivityDate = today`.
6. If `currentStreak` hits a milestone (7, 30) → award bonus points.

**Rationale**: Simple date comparison; no timezone ambiguity (always use Fiji
local date UTC+12 for "day" boundary).

---

## Decision: Redis Leaderboard

**Decision**: After each `pointsAccount.totalPoints` update, write to Redis
Sorted Set `leaderboard:weekly:{weekKey}` (score = trip count or points delta
that week) using `ZADD`. Top-10 queried via `ZREVRANGE`. Weekly key auto-expires
after 8 days (TTL set on creation).

**Rationale**: Redis Sorted Set is the canonical data structure for
leaderboards. O(log N) insert; O(K) range query. No DB query needed for
leaderboard display.

**Alternatives considered**:

- DB query with aggregation: Expensive; does not support real-time updates
  during an active week.
