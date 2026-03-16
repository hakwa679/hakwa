# Requirements Checklist: Gamified Review & Rating System

**Feature**: 011-gamified-review-rating  
**Last updated**: 2026-03-16

---

## Functional Requirements

### FR-001 Post-Trip Review Prompt (Passenger → Driver)

- [ ] Review card is displayed on the trip-complete screen without any extra
      navigation
- [ ] Card is pre-focused on the star rating row immediately on load
- [ ] A "Skip for now" option dismisses the card and schedules a reminder
      notification
- [ ] Tapping a star automatically advances to Step 2 (tag chips) without a
      separate "Next" tap

### FR-002 Post-Trip Review Prompt (Driver → Passenger)

- [ ] A "Rate this passenger" button is presented on the driver's trip-complete
      screen
- [ ] Tapping it opens the same three-step flow with driver→passenger tags shown
- [ ] The driver's review window is 24 hours from trip completion
- [ ] After the 24-hour window closes, the prompt is no longer accessible

### FR-003 Three-Step Progressive Review Flow

- [ ] Step 1: 5-star tap row — full width, large hit targets
- [ ] Step 2: grid of up to 8 tag chips (emoji + label) appropriate for the
      direction
- [ ] Negative tags (e.g. `late_arrival`) only shown in Step 2 when rating ≤ 3
      stars
- [ ] Step 3: optional comment field (1–280 chars) with live character counter
- [ ] Live points preview updates on Step 2 and Step 3 as selections change
- [ ] "Skip" link on Step 2 advances to Step 3 without selecting any tags

### FR-004 Review Submission

- [ ] `POST /reviews` creates a `trip_review` record with correct `direction`
- [ ] A `trip_review_tag` record is inserted for each selected tag
- [ ] Caller must be a participant on the specified trip (403 otherwise)
- [ ] Trip must be in `completed` status (422 otherwise)
- [ ] Duplicate submission rejected with `REVIEW_ALREADY_SUBMITTED` (409)
- [ ] Comment whitespace-trimmed before storage; whitespace-only → null
- [ ] Submission rejected after window expiry with `REVIEW_WINDOW_CLOSED` (410)

### FR-005 Points Calculation & Award

- [ ] Base 10 points awarded for any submitted rating
- [ ] +5 tag bonus awarded when 2 or more tags are selected
- [ ] +10 comment bonus awarded when a non-empty, non-whitespace comment is
      provided
- [ ] Maximum 25 points per review
- [ ] `points_awarded` stored on `trip_review` at submission time
- [ ] A single `points_ledger` entry created with
      `source_action = "review_submitted"`
- [ ] `reference_id` on the ledger entry is the `trip_review.id`
- [ ] `pointsAccount.totalPoints` updated in the same transaction
- [ ] Duplicate ledger entry rejected by unique constraint on
      `(account_id, source_action, reference_id)`

### FR-006 Double-Blind Reveal

- [ ] Reviewer can always see their own submitted review via
      `GET /reviews/trip/:tripId`
- [ ] Counterpart's review is withheld until both have submitted OR the
      counterpart's window has expired
- [ ] `pendingDirections` in the response indicates open, unsubmitted review
      windows
- [ ] `reviewWindowExpiresAt` returned for both directions in the trip reviews
      fetch

### FR-007 Reviewer Badge Evaluation

- [ ] `first_review` badge checked and awarded on first-ever review submission
- [ ] `tagged_reviewer` badge checked after every review; triggers at 5
      cumulative tagged reviews
- [ ] `dedicated_reviewer` badge triggers at 25 cumulative submitted reviews
- [ ] `veteran_reviewer` badge triggers at 100 cumulative submitted reviews
- [ ] `perfect_streak_reviewer` badge triggers after reviewing 7 consecutive
      completed trips
- [ ] All badge checks are idempotent — no duplicate `user_badge` records
      created
- [ ] In-app notification sent for every new badge awarded

### FR-008 Reputation Aggregates

- [ ] `GET /reviews/me` returns average rating, total count, rating breakdown
      (1-5), top tags, badges
- [ ] `GET /reviews/user/:userId` returns same public data (driver: includes
      last 5 comments)
- [ ] Reviewer identity is never exposed; comments shown as "A passenger"
- [ ] If < 3 reviews received, `averageRating` field is omitted from the
      response
- [ ] Only reviews that have passed the double-blind hold are included in
      aggregates

### FR-009 Reputation Badges

- [ ] `top_rated_driver` awarded when driver average ≥ 4.8 across ≥ 50 visible
      reviews
- [ ] `consistent_driver` awarded when driver has ≥ 50 visible reviews with zero
      1-star ratings
- [ ] `five_star_passenger` awarded when passenger average ≥ 4.8 across ≥ 20
      visible reviews
- [ ] Reputation badge re-evaluated after every double-blind lift
- [ ] Badge revoked (row deleted from `user_badge`) if criteria no longer met
- [ ] Revocation sends an in-app notification to the affected driver

### FR-010 Driver Reputation Dashboard

- [ ] `GET /reviews/me/dashboard` is restricted to operator-role sessions only
- [ ] Returns 6-month chart data (monthly average + count)
- [ ] Returns tag frequencies including negative tags (not shown on public
      profile)
- [ ] Annotations generated for negative tags appearing in > 5% of recent 30
      reviews
- [ ] Lists active reputation badges with award dates

### FR-011 Passenger Signal on Booking Card

- [ ] `GET /reviews/passenger-signal/:userId` returns minimal reputation payload
- [ ] Response cached with ≤ 30-second TTL
- [ ] Responds within 100 ms p95
- [ ] Returns `"New rider"` label when < 3 reviews received

### FR-012 Weekly Review Mission

- [ ] Completing 3 trip reviews in a calendar week (Monday–Sunday, Fiji time
      UTC+12) triggers 50 bonus points
- [ ] Bonus credited via `points_ledger` with
      `reference_id = "mission:weekly_review_3"`
- [ ] Mission progress included in `POST /reviews` response
- [ ] Mission resets at Monday 00:00 FJT; a user can earn it every week
- [ ] Completing more than 3 reviews in a week does not award the mission bonus
      again

### FR-013 Review Reminder Notification

- [ ] Reminder push notification scheduled when reviewer skips or exits without
      submitting
- [ ] Notification sent 6 hours before the review window closes
- [ ] Notification deep-links to the review card for the specific trip
- [ ] Notification not sent if the review has already been submitted
- [ ] Tapping a stale deep link (window already expired) shows "Review window
      closed" and routes home

---

## Non-Functional Requirements

### NFR-001 Performance

- [ ] `POST /reviews` responds within 300 ms p95 (including points ledger write)
- [ ] `GET /reviews/user/:userId` responds within 200 ms p95 (aggregate query +
      cache)
- [ ] `GET /reviews/passenger-signal/:userId` responds within 100 ms p95

### NFR-002 Data Integrity

- [ ] Unique constraint on `(trip_id, direction)` in `trip_review` enforced at
      DB level
- [ ] Unique constraint on `(review_id, tag_key)` in `trip_review_tag` enforced
      at DB level
- [ ] Unique constraint on `(account_id, source_action, reference_id)` in
      `points_ledger` enforced at DB level
- [ ] Reputation badge re-evaluation runs asynchronously for drivers with > 200
      reviews (not in request path)

### NFR-003 Privacy

- [ ] Reviewer identity is never exposed in any API response
- [ ] Passenger reviews are not shown as public comments on the passenger's
      profile
- [ ] Driver comments are anonymised ("A passenger") in all public responses
- [ ] Deleted users preserved in records with `SET NULL` — displayed as "Deleted
      user" in UI

### NFR-004 Security

- [ ] All review endpoints validate that the caller is a trip participant
- [ ] Tag direction validation prevents cross-direction tag injection
- [ ] `GET /reviews/me/dashboard` returns 403 for non-operator callers
- [ ] `GET /reviews/passenger-signal/:userId` returns 403 for non-operator
      callers

---

## Schema Migration Checklist

- [ ] `review_tag` table created with seed data (15 rows)
- [ ] `trip_review` table created with all constraints and indexes
- [ ] `trip_review_tag` table created with unique constraint
- [ ] `trip.completed_at` column added (nullable, no default — existing rows
      NULL)
- [ ] `points_ledger` composite unique constraint added on
      `(account_id, source_action, reference_id)`
- [ ] 8 new badge seed rows inserted into `badge` table
- [ ] Migration is reversible (down migration removes new tables and columns)

---

## Integration Points

- [ ] Spec 007 (Gamification): `review_submitted` source action already defined
      in `PointsSourceAction`
- [ ] Spec 007 (Gamification): badge evaluation flow extended with reviewer +
      reputation badges
- [ ] Spec 008 (Notifications): review reminder + badge award + badge revoked
      notification events registered
- [ ] Spec 003 (Booking Passenger): trip-complete screen integrates review card
      rendering
- [ ] Spec 004 (Driver Dispatch): driver trip-complete screen integrates
      passenger review prompt
- [ ] Spec 004 (Driver Dispatch): booking-request card displays passenger signal
      from `GET /reviews/passenger-signal/:userId`
