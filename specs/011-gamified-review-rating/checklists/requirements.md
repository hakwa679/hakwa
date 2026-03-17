# Requirements Checklist: Gamified Review & Rating System

**Feature**: 011-gamified-review-rating  
**Last updated**: 2026-03-17

---

## Functional Requirements (Spec-Aligned)

### FR-001 Passenger review window (72h)

- [x] Passenger can submit a 1-5 star review for a completed trip up to 72 hours
      after completion
- [x] Submission beyond 72 hours is rejected with `REVIEW_WINDOW_CLOSED`

### FR-002 Driver review window (24h)

- [x] Driver can submit a 1-5 star review for a completed trip up to 24 hours
      after completion
- [x] Submission beyond 24 hours is rejected with `REVIEW_WINDOW_CLOSED`

### FR-003 One review per direction per trip

- [x] Database enforces uniqueness on `(tripId, direction)` for `tripReview`
- [x] Duplicate submit path returns `REVIEW_ALREADY_SUBMITTED` (409)

### FR-004 Auto-present review card on completion

- [x] Rider trip-complete screen auto-shows review card without extra navigation
- [x] Driver trip-complete screen exposes rate-passenger flow on completion

### FR-005 Progressive points schedule

- [x] Rating-only submission awards 10 points
- [x] Tag bonus (+5) is awarded only when selected tag count is >= 2
- [x] Non-empty comment awards +10
- [x] Maximum per review is 25 points
- [x] Client preview matches server-authoritative awarded points

### FR-006 Double-blind reveal

- [x] Review visibility is computed at read time (no persisted visibility flag)
- [x] Counterpart review remains hidden until counterpart submits or counterpart
      window expires
- [x] Reveal logic is validated for both directions

### FR-007 Ledger entry on submission

- [x] Every successful review creates one `pointsLedger` record with
      `sourceAction = review_submitted`
- [x] `pointsAccount.totalPoints` is updated atomically in the same transaction
- [x] Idempotency guard exists on `(accountId, sourceAction, referenceId)`

### FR-008 Badge eligibility re-evaluated after review submit

- [x] `review_submitted` events are published to `gamification:events` stream
      post-commit
- [x] Reviewer badges are evaluated idempotently in worker pipeline

### FR-009 Directional windows are enforced by backend

- [x] Passenger-to-driver window uses 72h from `trip.completedAt`
- [x] Driver-to-passenger window uses 24h from `trip.completedAt`

### FR-010 Driver rating visible to passengers during matching

- [x] Rider-facing matching payload includes `driverRating` (avg + count from
      revealed reviews)
- [x] Fallback label/path for low review counts is implemented consistently

### FR-011 Passenger rating visible to drivers before acceptance

- [x] Booking request payload includes `passengerRating` (avg + count from
      revealed reviews)
- [x] "New rider" fallback is used when revealed review count is below threshold

### FR-012 Reminder for skipped review

- [x] Skip flow enqueues reminder through backend pipeline (not direct client
      push)
- [x] Reminder is scheduled for 6 hours before window close when still eligible
- [x] Reminder dispatch persists `notification` row before send and uses async
      dispatch events

---

## Story Extension Coverage (Non-FR)

### US10 Weekly Review Mission

- [x] Weekly mission tracks progress for "review 3 trips this week" (Fiji week)
- [x] One-time 50-point award per user per week is idempotent
- [x] Monday 00:00 FJT reset is implemented

### US11 Reminder UX behavior

- [x] Deep-link opens the specific trip review flow
- [x] Stale deep-link after expiry routes user safely with window-closed
      feedback

---

## Success Criteria & NFR Validation

### SC-001 Review conversion

- [x] Telemetry tracks completed trips vs passenger reviews within 72h
- [x] Rolling 30-day metric can report >= 40% conversion

### SC-002 Review card latency

- [x] Instrumentation measures `completed` transition to card-visible time
- [x] p95 can be evaluated against <= 300 ms target

### SC-003 Double-blind correctness

- [x] Automated tests validate reveal behavior for submit-submit and
      submit-expiry paths

### SC-004 Duplicate prevention

- [x] Automated tests verify zero duplicates per `(tripId, direction)`

### SC-005 Points correctness

- [x] Automated tests verify 10/15/25 outcomes and no over/under-award

---

## Schema & Data Checklist

- [x] `reviewTag` table exists with seed rows
- [x] `tripReview` table exists with directional uniqueness and supporting
      indexes
- [x] `tripReviewTag` join table exists with `(reviewId, tagId)` uniqueness
- [x] `trip.completedAt` exists and is set when trip transitions to `completed`
- [x] `pointsLedger` uniqueness on `(accountId, sourceAction, referenceId)` is
      applied

---

## Integration Checklist

- [x] Gamification worker consumes `review_submitted` events for badge and
      mission logic
- [x] Notification pipeline persists pending rows, dispatches async, and stores
      sent/failed status
- [x] Rider and driver trip-complete flows both integrate review card UX
- [x] Matching/dispatch payloads include both directional rating signals (driver
      to rider, passenger to driver)
