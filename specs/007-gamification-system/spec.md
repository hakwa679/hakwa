# Feature Specification: Gamification System

**Feature Branch**: `007-gamification-system`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Gamification system for passengers and operators (vehicle operators:
drivers, captains, bikers, pilots, etc.): points ledger, level progression,
badges, referral codes, daily streak tracking, and leaderboard

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Earn Points for Completing a Trip (Priority: P1)

After a passenger completes a trip, points are automatically credited to their
points account. The passenger sees an in-app notification acknowledging the
reward. Their running total and current level are visible on their profile.

**Why this priority**: Trip completion is the core earning event. All other
gamification mechanics build on top of this foundation.

**Independent Test**: A passenger who completes a trip has points credited to
their `pointsLedger`, their `pointsAccount.totalPoints` is updated, and an
in-app notification acknowledges the reward — independently of badges, streaks,
and leaderboards.

**Acceptance Scenarios**:

1. **Given** a passenger whose trip has just transitioned to `completed`,
   **When** the gamification hook fires after the primary transaction commits,
   **Then** a `pointsLedger` entry of type `trip_completed` is created for the
   correct point value.
2. **Given** a new ledger entry, **When** the passenger views their profile,
   **Then** the updated total points and current level are shown.
3. **Given** a points award, **When** the passenger has the app open, **Then**
   an in-app notification ("You earned X points!") appears immediately — silent
   credit is not acceptable.

---

### User Story 2 - Referral Code Sign-Up and Reward (Priority: P1)

Every user has a unique referral code displayed on their profile. When a new
user signs up using that code, the referrer receives referral signup points.
When the new user completes their first trip, the referrer receives additional
referral trip points. Both rewards are capped to prevent abuse.

**Why this priority**: Referrals are the primary organic growth mechanism in a
small market where word-of-mouth dominates.

**Independent Test**: A referrer's `pointsLedger` gains two entries
(`referral_signup` and `referral_trip`) when a referee signs up using their code
and then completes a first trip — independently of other gamification features.

**Acceptance Scenarios**:

1. **Given** an existing user's referral code, **When** a new user registers
   using that code, **Then** a `referral` record is created linking referrer to
   referee, and the referrer receives a `referral_signup` points ledger entry.
2. **Given** a `referral` record where the referee has not yet taken a trip,
   **When** the referee completes their first trip, **Then** the referrer
   receives a `referral_trip` points ledger entry.
3. **Given** a referrer who has already reached the maximum referral cap,
   **When** a new referee signs up using their code, **Then** the referral
   record is created normally but no additional points are awarded to the
   referrer (they are notified the cap has been reached).
4. **Given** a user without a referral code at sign-up, **When** they attempt to
   add one retroactively, **Then** the system does not allow retroactive
   referral code attachment.

---

### User Story 3 - Level Progression (Priority: P2)

As a user accumulates points, their level increases when they cross the points
threshold defined for the next level. Level-up triggers an in-app notification
and a visual celebration moment. The current level and progress to the next
level are visible on the user's profile.

**Why this priority**: Levels create a long-term progression goal that sustains
retention beyond badges and streaks.

**Independent Test**: A user whose `totalPoints` crosses a level threshold has
their computed level updated and receives a level-up notification.

**Acceptance Scenarios**:

1. **Given** a user whose `totalPoints` crosses the threshold for the next level
   after a points credit, **When** the system evaluates levels, **Then** the
   user's current level (computed from the level table) increases and a
   `level_up` notification is sent.
2. **Given** a user on their profile screen, **When** they view the level
   section, **Then** they see: current level name and number, total points, and
   a progress bar showing points earned toward the next level threshold.
3. **Given** level definitions in the lookup table, **When** a level's points
   threshold is updated by an admin, **Then** all users' current levels are
   re-derived at next read — no stored level field becomes stale.

---

### User Story 4 - Badge Awards (Priority: P2)

Users earn badges for milestone achievements (e.g., "First Trip", "10 Trips
Completed", "Top Referrer"). When a badge criterion is met, the badge is awarded
to the user's account with an in-app notification and a visual celebration. A
badge is only ever awarded once per user.

**Why this priority**: Badges provide discrete recognition moments that drive
shareability and social proof.

**Independent Test**: A user who completes their first trip is awarded the
"First Trip" badge, a `userBadge` record is created, and a notification is sent
— idempotently (a second trip completion does not re-award the badge).

**Acceptance Scenarios**:

1. **Given** a user who has just completed their first trip, **When** badge
   eligibility is evaluated, **Then** a `userBadge` record for "First Trip" is
   created and the user receives an in-app notification with the badge name and
   icon.
2. **Given** a user who already holds the "First Trip" badge, **When** badge
   eligibility is evaluated again after a second trip, **Then** no duplicate
   `userBadge` record is created (idempotent).
3. **Given** a badge visible on the user's profile, **When** the user shares it
   (future phase), **Then** the badge is always the canonical version defined in
   the badge table — no locally modified descriptions.

---

### User Story 5 - Daily Activity Streak (Priority: P3)

A user who completes at least one trip per day builds a streak. The streak count
is shown on their profile. When a streak milestone (7 days, 30 days) is reached,
bonus points are awarded. Missing a day resets the streak to zero.

**Why this priority**: Streaks create daily engagement habits critical in the
early platform phase when the user base is growing.

**Independent Test**: A user who completes a trip on consecutive days has their
`currentStreak` increment. Missing a day resets it to 0. A streak milestone
awards bonus points — independently of badge and level flows.

**Acceptance Scenarios**:

1. **Given** a user who completes a trip today (having completed one yesterday),
   **When** the streak is evaluated, **Then** `currentStreak` increments by 1
   and `streakCheckpoint` is updated to today.
2. **Given** a user with a `currentStreak` of 6 who completes a trip on day 7,
   **When** the streak milestone check runs, **Then** a `streak_bonus` points
   ledger entry is created and the user receives a notification.
3. **Given** a user with `currentStreak = 5` who does not complete a trip today,
   **When** the next trip is completed (day missed), **Then** `currentStreak`
   resets to 1.
4. **Given** a streak-extending trip, **When** the user's `longestStreak` would
   be exceeded, **Then** `longestStreak` is updated to the new value.

---

### User Story 6 - Leaderboard (Priority: P3)

Users can view a leaderboard showing the top-ranked passengers and operators by
total points. Their own rank is always visible even if they are not in the top
N.

**Why this priority**: Leaderboards drive competitive engagement and organic
social sharing.

**Independent Test**: The leaderboard returns a ranked list of users by total
points, served from a fast read path, independently of the points-earning flows.

**Acceptance Scenarios**:

1. **Given** users with varying total points, **When** a user opens the
   Leaderboard screen, **Then** they see the top 20 users ranked by total points
   with their name and point total.
2. **Given** a user not in the top 20, **When** they view the leaderboard,
   **Then** their own position and points are shown at the bottom of the list
   regardless of rank.
3. **Given** a user who just earned points, **When** the leaderboard is viewed,
   **Then** their new position is reflected within 60 seconds (eventual
   consistency is acceptable for leaderboard reads).

---

### Edge Cases

- What if points are awarded multiple times for the same trip (e.g., double-fire
  of the gamification hook)? Each points ledger action MUST be idempotent by
  trip ID and source action type — a unique constraint prevents duplicate
  entries for the same event.
- What if the referral cap is set to zero (disabled)? The system MUST still
  create `referral` records (for tracking) but award zero points — it MUST NOT
  error.
- What if the level table is empty? The system MUST gracefully return level 0 /
  no level and not crash.
- What if a badge's criterion changes after it was already awarded? Previously
  awarded badges are unaffected. The new criterion applies to future awards
  only.
- What if a streak evaluation is delayed by system downtime? The
  `streakCheckpoint` timestamp is the source of truth. If the checkpoint shows
  activity on the prior calendar day (Fiji time), the streak is considered
  maintained.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST maintain a `pointsAccount` record for every user. All
  points mutations MUST be recorded as individual `pointsLedger` entries — no
  points balance update is permitted without a corresponding ledger row.
- **FR-002**: Points source action types MUST be a closed enum in the schema
  (`trip_completed`, `referral_signup`, `referral_trip`, `streak_bonus`,
  `badge_awarded`, `review_submitted`). New types MUST be added to the enum,
  never inserted as free strings.
- **FR-003**: Every eligible action (trip completion, referral events, streak
  milestones) MUST trigger a `pointsLedger` entry. The entries MUST be created
  asynchronously after the primary transaction commits — gamification MUST NOT
  block the trip or payment critical path.
- **FR-004**: Every user MUST be assigned a unique `referralCode` at account
  creation, stored on their `pointsAccount`.
- **FR-005**: When a new user registers with a referral code, a `referral`
  record MUST be created linking referrer to referee, and the referrer MUST
  receive a `referral_signup` points ledger entry.
- **FR-006**: When a referred user completes their first trip, the referrer MUST
  receive a `referral_trip` points ledger entry.
- **FR-007**: Referral point rewards MUST be capped at a named constant maximum.
  When the cap is reached, no further points are awarded to the referrer but
  tracking records continue.
- **FR-008**: The current level for any user MUST be computed at read time from
  `pointsAccount.totalPoints` against the `level` lookup table — it MUST NOT be
  stored redundantly.
- **FR-009**: Level definitions MUST be data-driven rows in the `level` table
  (`levelNumber`, `name`, `pointsRequired`, `applicableTo`). Changing thresholds
  MUST require only a data change, not a code deploy.
- **FR-010**: Badges MUST be defined in a `badge` lookup table. A `userBadge`
  record MUST be created (idempotently) when a badge criterion is met. Badge
  grants MUST have a unique constraint on `(userId, badgeKey)` to enforce
  idempotency.
- **FR-011**: Badge eligibility MUST be evaluated asynchronously after every
  relevant `pointsLedger` write, without blocking the primary flow.
- **FR-012**: Streaks MUST be maintained through `currentStreak`,
  `longestStreak`, and `streakCheckpoint` on the `pointsAccount`. Missing a day
  MUST reset `currentStreak` to 0.
- **FR-013**: Reaching a streak milestone MUST create a `streak_bonus` points
  ledger entry and send a notification.
- **FR-014**: The leaderboard MUST be served from a Redis sorted set, not a
  direct database scan. The sorted set MUST be updated on every `totalPoints`
  change.
- **FR-015**: Points and badges are non-financial — they MUST NOT be convertible
  to wallet credit or cash in Phase 1.
- **FR-016**: Every points award, badge earn, and level-up MUST trigger an
  in-app notification. Silent credit is explicitly forbidden.

### Key Entities

- **PointsAccount**: One per user. Holds total points (materialised), referral
  code, current streak, longest streak, and streak checkpoint date.
- **PointsLedger**: Immutable log of every points event. Holds user ID, amount,
  source action type (enum), reference ID (trip, referral, etc.), and timestamp.
- **Level**: Lookup table of milestone thresholds. Holds level number, name,
  points required, and applicable population (`passenger` | `operator`).
- **Badge**: Lookup table of achievement definitions. Holds key, name,
  description, icon reference, and applicable population.
- **UserBadge**: Junction record for awarded badges. Holds user ID, badge key,
  and awarded timestamp. Unique on `(userId, badgeKey)`.
- **Referral**: Record linking a referrer to a referee. Holds referrer user ID,
  referee user ID, status, and reward event timestamps.

### Assumptions

- Gamification applies to passengers and operators (vehicle operators: drivers,
  captains, bikers, pilots, etc.) as separate populations with their own level
  tracks and point-earning actions.
- Social sharing of badges and achievements (deep-link share cards) is deferred
  to a future phase.
- A "review submitted" points source is defined in the enum but the review
  submission flow is out of scope for Phase 1.
- Admin tools for adjusting point values, adding badges, and managing level
  thresholds are out of scope for this spec (assumed to be direct database edits
  by the Hakwa team in Phase 1).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of trip completions produce a `points_completed` ledger entry
  for the passenger — zero missed awards in end-to-end test suite.
- **SC-002**: Badge awards are idempotent — zero duplicate `userBadge` records
  for the same user and badge key across all automated tests.
- **SC-003**: Gamification hooks add less than 50 ms of overhead to the trip
  completion response time (measured as time from trip-complete database commit
  to gamification hook enqueue — not total processing time).
- **SC-004**: Leaderboard reads return within 200 ms for a dataset of 10,000
  users.
- **SC-005**: Referral reward cap prevents any single referrer from accruing
  unlimited referral points — validated by automated abuse-scenario tests.
