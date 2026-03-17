# Feature Specification: Gamified Review & Rating System

**Feature Branch**: `011-gamified-review-rating`  
**Created**: 2026-03-16  
**Status**: Ready  
**Input**: An engaging, gamified post-trip review and rating system for both
passengers and drivers. Reviews must be fast to complete, intrinsically
rewarding, and produce reputation data that is genuinely useful to both sides of
the marketplace.

---

## Problem & Design Philosophy

Standard 1–5 star prompts are abandoned. Rates of completion hover around 20%
industry-wide because they feel like a chore with no personal benefit. Four
principles guide every decision in this feature:

1. **Instant reward over delayed gratitude.** The second a review submits, the
   user sees a celebration animation and the exact points they earned. The
   benefit is immediate and tangible — not a vague "you helped the community".

2. **Progressive effort, escalating reward.** The minimum effort (a single star
   tap) earns base points. Adding reaction tags earns more. Adding a comment
   earns the maximum. Every additional step earns incrementally — no step is
   wasted.

3. **Double-blind until mutual.** Neither party sees the other's review until
   both have submitted or the review window expires. This eliminates retaliation
   bias and inflated scores from reciprocal courtesy.

4. **Reputation that matters pre-trip.** Drivers see a passenger's rating before
   accepting. Passengers see a driver's rating when matched. Both parties are
   motivated to maintain their score — not just collect it.

---

## Roles & Directions

| Reviewer  | Reviewee  | Window | Notes                                     |
| --------- | --------- | ------ | ----------------------------------------- |
| Passenger | Driver    | 72 h   | Prompted immediately after trip completes |
| Driver    | Passenger | 24 h   | Prompted from the trip-complete screen    |

A trip produces at most two `trip_review` records — one per direction. Each
direction is independent: a passenger's failure to review does not block the
driver from reviewing (and vice versa), but neither review becomes visible to
the reviewee until the double-blind rules are satisfied.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Post-Trip Rating Prompt: Passenger Reviews Driver (Priority: P1)

The passenger's active-trip screen transitions to a "Trip complete" summary
showing the final fare. Immediately below it is a full-screen review card. The
passenger taps a star rating (1–5), optionally selects reaction tags (e.g. "Safe
driver", "Friendly"), optionally types a short comment, then taps "Submit". A
celebration animation plays and a points badge pop-up shows points earned. The
card disappears and the passenger lands on their home screen.

**Why this priority**: Passenger→driver reviews are the primary source of driver
reputation data and the anchor for all gamification mechanics in this feature.

**Independent Test**: A passenger whose trip has just transitioned to
`completed` is presented with a review card. Submitting a star rating (with no
tags or comment) creates a `trip_review` record, awards `review_submitted`
points to their ledger, plays a celebration animation, and routes them to the
home screen — independently of the double-blind reveal, badge checks, or driver
review flow.

**Acceptance Scenarios**:

1. **Given** a trip that has just transitioned to `completed`, **When** the
   passenger lands on the trip-complete screen, **Then** a review card is
   displayed without requiring any navigation, already pre-focused on the star
   row.
2. **Given** the review card is visible, **When** the passenger taps 4 stars and
   submits without tags or a comment, **Then** a `trip_review` record is created
   (`rating = 4`, `pointsAwarded = 10`) and a `pointsLedger` entry of type
   `review_submitted` for 10 points is created.
3. **Given** a successful review submission, **When** the passenger is on the
   submit step, **Then** a celebration animation (confetti burst) plays
   immediately, followed by a points badge showing "+X pts" floating up to the
   header balance counter.
4. **Given** the review card is visible, **When** the passenger taps "Skip" (if
   they choose not to review at this time), **Then** the card dismisses without
   creating a `trip_review` record, and a reminder push notification is
   scheduled for 6 hours later (if the review window has not yet closed).
5. **Given** a passenger who already submitted a review for this trip, **When**
   the system attempts to create a duplicate, **Then** the duplicate is rejected
   by the unique constraint on `(trip_id, direction)` and the API returns a
   `REVIEW_ALREADY_SUBMITTED` error.

---

### User Story 2 — Driver Reviews Passenger (Priority: P1)

After marking a trip complete, the driver's app shows a "Rate this passenger"
card with the same star + tag + comment flow. The driver has a 24-hour window.
The passenger's rating affects whether future drivers receive a courtesy signal
on the booking request card ("4.9 ★ passenger").

**Why this priority**: Driver→passenger reviews create mutual accountability —
passengers behave better when they know their rating is visible to future
drivers.

**Independent Test**: A driver completing a trip can submit a passenger review
(`direction = "driver_to_passenger"`), have a `trip_review` record created, and
earn review points — independently of the passenger's review and visibility
rules.

**Acceptance Scenarios**:

1. **Given** a trip that has just transitioned to `completed` on the driver's
   screen, **When** the driver taps "Rate passenger", **Then** a review card is
   shown with tags appropriate to the driver→passenger direction (e.g. "Polite",
   "Ready on time", "Respectful").
2. **Given** a driver review submission with 5 stars and 2 tags, **Then** a
   `trip_review` record is created (`pointsAwarded = 15`) and a `pointsLedger`
   entry for 15 points is created.
3. **Given** a driver who did not submit a review within 24 hours of trip
   completion, **When** any read of that trip's reviews occurs, **Then** the
   passenger's review (if submitted within 72 h) becomes visible to the driver
   regardless — the driver forfeits their review opportunity but the passenger's
   review is not penalised.

---

### User Story 3 — Stepwise Review Flow with Tag Reactions (Priority: P1)

The review card uses a three-step progressive flow:

- **Step 1 — Stars**: Large, tappable star row. Selecting any star automatically
  advances to Step 2.
- **Step 2 — Tags**: A grid of 6 readable tag chips (emoji + label). The user
  taps any combination. A "Skip" link advances to Step 3 with no tags.
- **Step 3 — Comment**: An optional text field (max 280 characters) with a
  placeholder hinting at the bonus: "Add a note for 10 extra points →". A
  "Submit" button and the current points tally (updating live) are both visible.

**Why this priority**: The three-step flow is the core UX mechanic that makes
the system feel like a game rather than a form. It must be correct before any
gamification hook is layered on top.

**Acceptance Scenarios**:

1. **Given** the review card is at Step 1, **When** the passenger taps any star,
   **Then** the card transitions to Step 2 without requiring a separate "Next"
   tap.
2. **Given** Step 2 is visible, **When** the user taps two or more tags,
   **Then** a live points preview at the bottom of the card increments: "Base 10
   pts + 5 tags bonus = 15 pts".
3. **Given** Step 3 is visible with a non-empty comment, **When** the user types
   text, **Then** the live points preview increments by the comment bonus: "Base
   10 + 5 tags + 10 comment = 25 pts".
4. **Given** Step 3 is visible, **When** the user taps "Submit", **Then** the
   `pointsAwarded` stored on the `trip_review` record matches the figure shown
   in the preview exactly.
5. **Given** Step 3 with a comment exceeding 280 characters, **When** the user
   attempts to submit, **Then** the input field shows an inline character-count
   warning and the submit button is disabled until the comment is trimmed.

---

### User Story 4 — Points & Bonus Calculation (Priority: P1)

Every submitted review earns an automatically calculated point total based on
the depth of the submission. The schedule is:

| Component         | Points | Condition                       |
| ----------------- | ------ | ------------------------------- |
| Base rating       | 10     | Any star rating submitted       |
| Tag bonus         | +5     | 2 or more tag chips selected    |
| Comment bonus     | +10    | Non-empty comment (1–280 chars) |
| **Maximum total** | **25** | All three components present    |

**Why this priority**: The point schedule is the core economic incentive. It
must work correctly before any badge or mission depends on it.

**Independent Test**: Reviewing a trip with rating + 2 tags + comment awards
exactly 25 points in a single `pointsLedger` entry. Reviewing with rating only
awards exactly 10 points. Both values are verifiable without enabling any other
gamification feature.

**Acceptance Scenarios**:

1. **Given** a submission with `rating = 4`, no tags, no comment, **Then**
   `pointsAwarded = 10` and a single `pointsLedger` entry with `amount = 10` and
   `sourceAction = "review_submitted"` is created.
2. **Given** a submission with `rating = 5`, 3 tags, no comment, **Then**
   `pointsAwarded = 15`.
3. **Given** a submission with `rating = 3`, 2 tags, and a comment, **Then**
   `pointsAwarded = 25`.
4. **Given** a submission with `rating = 5`, 1 tag only (one tag does not reach
   the 2-tag threshold), no comment, **Then** `pointsAwarded = 10` — no tag
   bonus.
5. **Given** any review submission, **When** the points entry is created,
   **Then** the `pointsAccount.totalPoints` for the reviewer is updated
   atomically in the same database transaction.

---

### User Story 5 — Double-Blind Reveal (Priority: P1)

Reviews are hidden from the reviewee until the reveal condition is met. This
prevents both parties from gaming their rating by waiting to see the other's
score first.

**Reveal condition**: A review becomes visible to the reviewee when **either**:
(a) the counterpart review (opposite direction) has been submitted, **or**  
(b) the counterpart's review window has expired without submission.

**Why this priority**: Without double-blind, high-trust markets devolve into
mutual 5-star reciprocity and the rating system loses meaning entirely.

**Independent Test**: A passenger submits a review. Reading the trip reviews as
the driver returns zero reviews (the driver's review window is still open and no
driver review exists). The driver then submits their review. Reading trip
reviews as the driver now returns both reviews — the blind hold lifted the
moment the counterpart submitted.

**Acceptance Scenarios**:

1. **Given** only the passenger review exists and the driver's 24 h window is
   still open, **When** the driver calls `GET /reviews/trip/:tripId`, **Then**
   the response includes the driver's own review (if submitted) but NOT the
   passenger's review.
2. **Given** only the passenger review exists and the driver's 24-hour window
   has expired, **When** the driver calls `GET /reviews/trip/:tripId`, **Then**
   the passenger's review is now included in the response.
3. **Given** both reviews exist (regardless of which was submitted first),
   **When** either party reads the trip's reviews, **Then** both reviews are
   included.
4. **Given** the reveal has occurred, **When** the reviewee's profile aggregates
   are refreshed, **Then** the newly-visible rating is included in their average
   and tag counts.

---

### User Story 6 — Reviewer Badges (Priority: P2)

Consistent reviewers earn badges that recognise their contribution to platform
quality. Badge checks run after every review submission.

| Badge Key                 | Name                | Awarded When                                              |
| ------------------------- | ------------------- | --------------------------------------------------------- |
| `first_review`            | First Impression    | User submits their very first review                      |
| `tagged_reviewer`         | Attention to Detail | User submits 5 reviews that include 2+ tags each          |
| `dedicated_reviewer`      | Dedicated Reviewer  | User submits 25 reviews in total                          |
| `veteran_reviewer`        | Review Veteran      | User submits 100 reviews in total                         |
| `perfect_streak_reviewer` | On a Roll           | User reviews every completed trip for 7 consecutive trips |

**Why this priority**: Badges provide discrete social recognition that sustains
reviewing behaviour beyond the initial points novelty.

**Acceptance Scenarios**:

1. **Given** a user who has never reviewed before, **When** they submit their
   first review, **Then** the `first_review` badge is awarded, a `userBadge`
   record is created, and an in-app notification celebrates the achievement.
2. **Given** a user with 4 tagged‐reviews submitted, **When** they submit their
   5th review with 2+ tags, **Then** the `tagged_reviewer` badge is awarded
   immediately after the review transaction commits.
3. **Given** a user who already holds `first_review`, **When** they submit
   additional reviews, **Then** no duplicate `userBadge` record is created for
   `first_review` (idempotent).
4. **Given** a user who has reviewed 6 of their last 6 completed trips
   consecutively, **When** they review their 7th completed trip, **Then** the
   `perfect_streak_reviewer` badge is awarded.

---

### User Story 7 — Reputation Display on Profiles (Priority: P2)

Every user's profile shows a reputation summary drawn from the reviews they have
received. The summary is computed at read time and cached.

**For drivers**:

- Average star rating (to one decimal place) and total review count
- Top 3 most-cited positive tags as chips with percentage citation frequency  
  (e.g. "🛡️ Safe driver — 94%")
- Breakdown: % of 5-star, 4-star, 3-star, 2-star, and 1-star reviews
- Last 5 written comments (anonymous: reviewer name is always "A passenger")

**For passengers**:

- Average star rating and total review count
- Top 2 most-cited tags
- Rating visible to drivers when a booking request is dispatched

**Why this priority**: Reputation display closes the feedback loop — reviewers
can see the result of their effort on the reviewee's profile, reinforcing the
sense that their review mattered.

**Acceptance Scenarios**:

1. **Given** a driver with 30 received reviews, **When** another user loads
   their profile, **Then** the average rating, total count, top-3 tag chips, and
   last 5 comments are all present in the response payload.
2. **Given** a driver with no received reviews, **When** their profile is
   loaded, **Then** the average is omitted (not shown as 0.0), the tag chips
   section is empty, and the comments are an empty array.
3. **Given** a passenger with a computed average rating, **When** a booking
   request is dispatched to a driver, **Then** the driver's booking-request card
   includes the passenger's average rating and review count (if at least 3
   reviews exist; "New rider" shown otherwise).
4. **Given** a review that is still within the double-blind window, **When** the
   reviewee's public profile is fetched, **Then** that review is NOT included in
   the aggregate until the blind lifts.

---

### User Story 8 — Driver Reputation Dashboard (Priority: P2)

Drivers have access to a dedicated "My Reputation" screen showing more than the
public summary. It includes: their full rating history over time (chart),
average broken down by tag category, any review that resulted in a badge award,
and actionable feedback annotations (auto-generated text based on low-scoring
tags, e.g. "3 recent passengers mentioned 'Late arrival' — check your ETA
accuracy").

**Why this priority**: Drivers are more likely to sustain high ratings when they
can see exactly what to improve rather than just a number trending down.

**Acceptance Scenarios**:

1. **Given** an authenticated driver, **When** they open the "My Reputation"
   screen, **Then** they see their average rating, total trips reviewed, and a
   monthly average chart going back 6 months.
2. **Given** a driver with at least 5 reviews citing the tag `late_arrival`,
   **When** the reputation screen loads, **Then** an actionable annotation is
   shown: "5 passengers recently mentioned 'Late arrival'."
3. **Given** a driver who earned a reputation badge (`top_rated_driver`),
   **When** they open their reputation screen, **Then** the badge is highlighted
   with the date it was awarded.

---

### User Story 9 — Reputation Badges (Priority: P2)

Reviewees earn badges for consistently high ratings received over a sustained
number of trips.

| Badge Key             | Name              | Criteria (received reviews)                      |
| --------------------- | ----------------- | ------------------------------------------------ |
| `top_rated_driver`    | Top Rated Driver  | Average ≥ 4.8 over at least 50 driver reviews    |
| `consistent_driver`   | Consistent Driver | 50+ reviews with zero 1-star ratings             |
| `five_star_passenger` | Five-Star Rider   | Average ≥ 4.8 over at least 20 passenger reviews |

Reputation badges are re-evaluated after each new review becomes visible (post
double-blind lift). They are revoked and re-awarded as the average changes — the
`userBadge` record is updated (not duplicated).

**Acceptance Scenarios**:

1. **Given** a driver whose average (visible reviews) crosses 4.8 on their 50th
   review, **When** the post-reveal hook evaluates badges, **Then** the
   `top_rated_driver` badge is upserted into `user_badge`.
2. **Given** a driver who holds `top_rated_driver` and then receives a batch of
   low reviews dropping their average below 4.8, **When** the badge is
   re-evaluated, **Then** the `user_badge` record for `top_rated_driver` is
   removed (badge revoked) and an internal notification is sent to the driver
   explaining why.
3. **Given** a driver with 50 reviews, all ≥ 2 stars (none are 1-star), **When**
   `consistent_driver` is evaluated, **Then** the badge is awarded.

---

### User Story 10 — Weekly Review Mission (Priority: P3)

The weekly gamification mission pool includes a "Review 3 trips this week"
mission. Completing it earns 50 bonus points and contributes to the
`map_mission_completed` badge. The mission resets every Monday at 00:00 Fiji
time (UTC+12).

**Why this priority**: Missions create a recurring engagement hook that brings
occasional users back to reviewing after they've stopped caring about the base
points.

**Acceptance Scenarios**:

1. **Given** a passenger who has reviewed 2 trips this week, **When** they
   review a third, **Then** the mission is marked complete and 50 bonus points
   are credited via a new `pointsLedger` entry with
   `sourceAction = "review_submitted"` and
   `referenceId = "mission:weekly_review_3"`.
2. **Given** a completed weekly review mission, **When** the user submits a
   fourth trip review in the same week, **Then** no additional mission bonus is
   awarded (the mission is already complete for this week).
3. **Given** the start of a new week (Monday 00:00 FJT), **When** the mission
   counter resets, **Then** a user who completed the mission last week can
   complete it again for this week's 50 bonus points.

---

### User Story 11 — Review Reminder Notification (Priority: P3)

If a user has a pending reviewable trip and has not yet submitted their review,
a push notification reminds them 6 hours before their review window closes.

**Why this priority**: A timely nudge converts users who forgot about the review
back into reviewers without being intrusive.

**Acceptance Scenarios**:

1. **Given** a passenger who skipped the review card immediately after trip
   completion, **When** 66 hours have elapsed since trip completion (72 h window
   - 6 h reminder), **Then** a push notification is sent: "You still have time!
     Rate your trip with [Driver Name] and earn up to 25 points."
2. **Given** a reminder notification is sent, **When** the passenger taps it,
   **Then** they are deep-linked directly to the review card for that specific
   trip.
3. **Given** a passenger who already submitted their review, **When** the
   66-hour mark passes, **Then** no reminder notification is sent (the review is
   already complete).
4. **Given** a passenger's review window that has already expired, **When** they
   tap a stale deep link, **Then** the app shows a "Review window closed"
   message and routes them to their home screen — it does not allow late
   submissions.

---

## Edge Cases

- **Idempotent submission**: A unique constraint on `(trip_id, direction)` in
  `trip_review` prevents double submission at the database level. The API also
  checks before insert and returns `REVIEW_ALREADY_SUBMITTED` (HTTP 409).
- **Points double-award prevention**: The `pointsLedger` unique constraint on
  `(account_id, source_action, reference_id)` ensures a given review ID can only
  produce one ledger entry. If the hook fires twice (e.g. network retry), the
  second insert is a no-op.
- **Mid-window account deletion**: If either party deletes their account during
  the review window, the review record is preserved (`reviewer_user_id` and
  `reviewee_user_id` use `SET NULL` on DELETE). The visible text shows "Deleted
  user" in the profile view.
- **Zero-star submission attempt**: The API rejects `rating = 0` with
  `REVIEW_INVALID_RATING` (HTTP 422). Minimum is 1 star.
- **Tags from wrong direction**: The API validates that every submitted tag key
  belongs to the requested direction (`passenger_to_driver`,
  `driver_to_passenger`, or `both`). A mismatched tag returns
  `REVIEW_INVALID_TAG` (HTTP 422).
- **Comment with only whitespace**: Treated as no comment — trimmed before
  storage. Does not qualify for the comment bonus.
- **Reputation badge re-evaluation at scale**: Badge re-evaluation after every
  visible review is an O(review count) query. For drivers with 1,000+ reviews,
  this must run asynchronously in a background job, not in the request path.
- **New trip types**: If non-taxi products are added later (e.g. delivery), the
  `trip_review` table accommodates them via the `trip_id` foreign key — no
  schema change is required.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow a passenger to submit a star rating (1–5) for a
  completed trip within 72 hours of trip completion.
- **FR-002**: System MUST allow a driver to submit a star rating (1–5) for a
  passenger within 24 hours of trip completion.
- **FR-003**: Each trip MUST produce at most one `trip_review` record per
  direction; duplicate submissions MUST be rejected with
  `REVIEW_ALREADY_SUBMITTED` (HTTP 409).
- **FR-004**: The review card MUST be presented automatically on the
  trip-complete screen without requiring additional navigation.
- **FR-005**: The three-step review flow (stars → tags → comment) MUST award
  incremental points: base points for stars only, +5 points only when two or
  more tags are selected, and maximum points for including a non-empty comment.
- **FR-006**: Neither party's review content MUST be visible to the reviewee
  until both parties have submitted OR the respective review window has expired
  (double-blind rule).
- **FR-007**: Each submitted review MUST result in a `pointsLedger` entry of
  type `review_submitted` for the reviewer.
- **FR-008**: Badge eligibility MUST be re-evaluated after each review
  submission.
- **FR-009**: The passenger-to-driver review window is 72 hours from trip
  completion; the driver-to-passenger window is 24 hours.
- **FR-010**: A driver's aggregated star rating MUST be displayed on the booking
  request card visible to passengers during matching.
- **FR-011**: A passenger's aggregated star rating MUST be displayed on the
  booking request card received by the driver before acceptance.
- **FR-012**: A review skipped at the trip-complete screen MUST trigger a
  reminder push notification 6 hours later, provided the review window is still
  open.

### Key Entities

- **TripReview**: One record per direction per trip. Holds `tripId`, `direction`
  (`passenger_to_driver` | `driver_to_passenger`), `reviewerUserId`,
  `revieweeUserId`, `rating` (1–5), `tags` (array of tag keys), `comment`
  (nullable, max 280 characters), `pointsAwarded`, `createdAt`.
- **ReviewTag**: Lookup table of predefined tag chips scoped by `direction`.
  Carries `key`, `label`, `emoji`.
- **UserReputation**: Derived per-user summary computed from all visible
  `trip_review` records — not stored independently.

Reveal status is computed at read time using counterpart submission and window
expiry; no persisted visibility flag is stored on `trip_review`.

### Assumptions

- This feature depends on `007-gamification-system` for point-award mechanics
  and badge evaluation.
- This feature depends on `008-notification-system` for review reminder and
  celebration notification delivery.
- Trip reviews are append-only; once submitted, a review cannot be edited or
  deleted by either party.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At least 40% of completed trips receive a passenger-to-driver
  review submission within the 72-hour window, measured over any rolling 30-day
  cohort.
- **SC-002**: The review card appears on the trip-complete screen within 300 ms
  of the `completed` status transition — no additional navigation required.
- **SC-003**: Double-blind logic correctly withholds review content until the
  reveal condition is met in 100% of automated test cases.
- **SC-004**: Zero duplicate `trip_review` records are created for the same
  `(trip_id, direction)` pair — enforced by unique constraint, validated across
  all automated tests.
- **SC-005**: Review point awards match the configured step schedule (base / tag
  bonus / comment bonus) with zero over- or under-awards in all automated tests.
