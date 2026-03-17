# Research: Gamified Review & Rating System

**Feature**: 011-gamified-review-rating  
**Status**: Resolved

---

## Decision 1: Double-Blind Reveal Logic

**Decision**: Neither review is visible to the reviewee until either (a) both
sides have submitted, or (b) the **reviewer's** window for the counterpart
review has expired. Reveal logic is computed at the API layer on each read — no
stored `isRevealed` flag.

**Expiry windows**:

- Passenger review visibility unblocked when: counterpart driver review exists
  OR `trip.completedAt + 24h` has passed (driver's window)
- Driver review visibility unblocked when: counterpart passenger review exists
  OR `trip.completedAt + 72h` has passed (passenger's window)

**Rationale**: Storing no `isRevealed` flag keeps the data model simple and
avoids a background job. The reveal condition is deterministic from existing
timestamps — safe to compute on every read. The asymmetric windows (72h
passenger, 24h driver) reflect the spec: passengers have more time, drivers see
their rating sooner.

**Query pattern** for `GET /api/v1/reviews/trips/:tripId/mine`:

1. Fetch both reviews for the trip (if they exist).
2. For each review: evaluate reveal condition against `now()` and presence of
   counterpart.
3. Return reviews with `isRevealed` boolean; mask `rating`, `comment`, `tags`
   when `isRevealed = false`.

**Alternatives considered**:

- Scheduled job to flip `isRevealed = true` on review rows — adds a background
  job dependency for no benefit; API-layer computation is simpler.
- Real-time WebSocket push when both reviews submitted — implemented as a bonus:
  publish `review:revealed:{userId}` to Redis pub/sub after each submit that
  completes the pair.

---

## Decision 2: Points Formula

**Decision**: Points awarded based on completeness of the review submission:

| Submission level        | Points |
| ----------------------- | ------ |
| Star only (1–5)         | 5      |
| Star + ≥1 tag           | 8      |
| Star + ≥1 tag + comment | 12     |

Points are written to the `pointsLedger` table atomically within the review
submission transaction, referencing `source_action = 'review_submitted'` and
`reference_id = trip_review.id`. Idempotency guard:
`UNIQUE(account_id, source_action, reference_id)` on `pointsLedger` (additive
constraint added in this feature).

**Rationale**: Progressive reward matches the spec principle ("every additional
step earns incrementally"). The amounts are modest to avoid gaming (a user
cannot earn significant points by submitting empty reviews). The `reference_id`
uniqueness guard prevents re-trigger if the route handler is called twice.

**Alternatives considered**:

- Fixed points regardless of quality — rejected per spec principle 2.
- Points as a post-commit gamification event (via Redis Stream) — viable but
  unnecessary complexity; review points are simple enough to award synchronously
  in the same transaction.

---

## Decision 3: Review Window Enforcement

**Decision**: On `POST /api/v1/reviews/trips/:tripId`, check:

1. Trip status is `completed`.
2. Caller is a participant (passenger or driver).
3. No existing review in this direction (idempotency via
   `UNIQUE(trip_id, direction)`).
4. `now() <= trip.completedAt + window` (window = 72h passenger, 24h driver).
   Return `REVIEW_WINDOW_CLOSED` (HTTP 410) if outside window.

**Rationale**: Window closure is enforced server-side — the client timer is
advisory only. A malicious client bypassing the UI timer must still hit this
gate.

---

## Decision 4: Reaction Tag Validation

**Decision**: Tag keys submitted with a review are validated server-side against
the `review_tag` lookup table. Tags with `direction` not matching the review
direction (and not `"both"`) return `REVIEW_INVALID_TAG`. Max 5 tags per review
(enforced at application layer).

**Negative tags** (e.g., `late_arrival`): returned in the tag list for all
callers; the mobile UI shows them only when star rating ≤ 3. Backend has no
special handling — they are stored and counted like any other tag.

**Rationale**: Server-side validation prevents tag injection from unofficial
clients. Max 5 tags keeps submissions meaningful.

---

## Decision 5: Reputation Score Computation

**Decision**: The `reputationScore` shown on a user's profile is the arithmetic
mean of all rating values where the review `isRevealed` (as per the double-blind
rule). Computed at query time from the `trip_review` table; not stored as a
column.

**Formula**:
`AVG(rating) WHERE reviewee_user_id = :userId AND isRevealed(review)`

For performance, a Redis cached value `reputation:{userId}` is invalidated on
each new reveal event (after both-submitted or window expiry). Cache TTL: 5
minutes as a backstop.

**Alternatives considered**:

- Stored `reputationScore` column on the `user` table — rejected:
  denormalization requires update logic; average from reviews is authoritative
  and cheap enough for Phase 1 at Fiji scale.
- Bayesian average (with prior) — better for users with very few reviews;
  deferred to Phase 2; flag as
  `// TODO: Bayesian average when review count < 10`.

---

## Decision 6: Review Submission Idempotency

**Decision**: `UNIQUE(trip_id, direction)` on `trip_review` is the primary
idempotency mechanism. If the constraint fires, return HTTP 409
`REVIEW_ALREADY_SUBMITTED` with the existing record so the mobile app can show
the correct state (already submitted → go to home screen).

**Rationale**: Network retries or double-taps on the submit button must never
create duplicate reviews. DB-level constraint is the safest guard —
application-level checks are susceptible to race conditions.

---

## Decision 7: Badge Triggers for Reviewers

**Decision**: Eight new badge rows in the `badge` seed table triggered by review
milestones:

| Badge key           | Trigger condition                                                |
| ------------------- | ---------------------------------------------------------------- |
| `first_review`      | First review ever submitted                                      |
| `review_streak_5`   | 5 reviews in a 7-day window                                      |
| `detailed_reviewer` | 10 reviews with comments                                         |
| `helpful_tags`      | 20 reviews with ≥3 tags each                                     |
| `top_rated_driver`  | Driver: rating average ≥ 4.8 over ≥50 reviews                    |
| `consistent_rider`  | Passenger: rating average submitted ≥ 4.5 over ≥20 reviews given |
| `trusted_passenger` | Passenger: receives ≥20 reviews averaging ≥ 4.5                  |
| `five_star_driver`  | Driver: first trip with 5-star rating received                   |

Badges are evaluated by the gamification worker via the `gamification:events`
Redis Stream, triggered by a `review_submitted` event published post-commit.
This reuses the existing Spec 007 gamification pipeline.

**Rationale**: Consistent with Spec 007 pattern — post-commit event, no inline
badge evaluation in the review transaction.
