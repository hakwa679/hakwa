# Data Model: Gamified Review & Rating System

**Feature**: 011-gamified-review-rating  
**Schema file**: `pkg/db/schema/review.ts`  
**Last updated**: 2026-03-16

---

## Overview

Three new tables are introduced. All live in `pkg/db/schema/review.ts` and are
exported through `@hakwa/db`.

No existing tables are structurally altered. The following additive changes are
made to existing schema:

- `gamification.PointsSourceAction` gains no new values — `"review_submitted"`
  is already present on the type.
- `gamification.badge` seed data gains 8 new rows (reviewer badges + reputation
  badges — see Badge Seed Data section below).
- `gamification.pointsLedger` gains a new unique constraint on
  `(account_id, source_action, reference_id)` to prevent double-awarding
  (idempotency guard).

---

## New Tables

### `review_tag`

Lookup table of all available reaction tag chips. Seeded at deploy time; never
written by end users.

```
review_tag
├── id           uuid          PK, random
├── key          varchar(60)   UNIQUE NOT NULL — machine key, e.g. "safe_driver"
├── label        varchar(80)   NOT NULL — display text, e.g. "Safe driver"
├── icon         varchar(10)   NOT NULL — single emoji, e.g. "🛡️"
├── direction    text          NOT NULL — "passenger_to_driver" | "driver_to_passenger" | "both"
└── sort_order   smallint      NOT NULL default 0 — controls chip display order
```

**Indexes**: None required (table is tiny; full-scan is fast).

**Seed data**:

| Key                | Label                | Icon | Direction           | Order |
| ------------------ | -------------------- | ---- | ------------------- | ----- |
| `safe_driver`      | Safe driver          | 🛡️   | passenger_to_driver | 1     |
| `friendly`         | Friendly             | 😊   | both                | 2     |
| `on_time`          | On time              | ⏱️   | passenger_to_driver | 3     |
| `clean_car`        | Clean car            | ✨   | passenger_to_driver | 4     |
| `smooth_ride`      | Smooth ride          | 🚗   | passenger_to_driver | 5     |
| `good_route`       | Good route           | 📍   | passenger_to_driver | 6     |
| `professional`     | Professional         | 👔   | passenger_to_driver | 7     |
| `quiet_respectful` | Gave me space        | 🤫   | passenger_to_driver | 8     |
| `late_arrival`     | Late arrival         | 🕐   | passenger_to_driver | 9     |
| `polite`           | Polite               | 🤝   | driver_to_passenger | 1     |
| `ready_on_time`    | Ready on time        | ⏱️   | driver_to_passenger | 2     |
| `respectful`       | Respectful           | 🫡   | driver_to_passenger | 3     |
| `kept_car_clean`   | Kept car clean       | ✨   | driver_to_passenger | 4     |
| `good_directions`  | Gave good directions | 📍   | driver_to_passenger | 5     |
| `easy_to_find`     | Easy to find         | 📌   | driver_to_passenger | 6     |

> **Note on negative tags** (`late_arrival`): Negative tags are included because
> they produce actionable signal for the driver reputation dashboard. They are
> shown on the Step 2 chip grid only when the passenger gave ≤ 3 stars. They are
> never displayed publicly as tag chips on the driver's profile — only reflected
> in the annotation system.

---

### `trip_review`

The central record for every submitted review. One row per trip per direction.

```
trip_review
├── id                uuid          PK, random
├── trip_id           uuid          NOT NULL — FK → trip.id (SET NULL on DELETE)
├── reviewer_user_id  text          nullable — FK → user.id (SET NULL on DELETE)
├── reviewee_user_id  text          nullable — FK → user.id (SET NULL on DELETE)
├── direction         text          NOT NULL — "passenger_to_driver" | "driver_to_passenger"
├── rating            smallint      NOT NULL — CHECK (rating BETWEEN 1 AND 5)
├── comment           text          nullable — max 280 chars (enforced at app layer)
├── points_awarded    integer       NOT NULL default 0
├── submitted_at      timestamp     NOT NULL default now()
└── UNIQUE (trip_id, direction)
```

**Indexes**:

- B-tree on `reviewer_user_id` — "reviews I submitted" history
- B-tree on `reviewee_user_id` — profile reputation aggregate queries
- B-tree on `trip_id` — trip-level review fetch
- B-tree on `submitted_at` — time-range queries for weekly mission counter

**Referential integrity**:

`reviewer_user_id` and `reviewee_user_id` use `ON DELETE SET NULL`. This
preserves the review record (and the integrity of reputation aggregates) even
when a user deletes their account. Any profile or comment display substitutes
"Deleted user" in the UI where `reviewer_user_id IS NULL`.

**Double-blind visibility rule** (applied at the API layer, not stored):

A review R (direction D, submitted_at T) is **visible** to the reviewee when:

```
(counterpart review with opposite direction exists for same trip_id)
  OR
(now() > review_window_expiry(D))
```

Where `review_window_expiry`:

- passenger_to_driver review window: `trip.completed_at + 72 hours`
- driver_to_passenger review window: `trip.completed_at + 24 hours`

The counterpart window expiry checked for the blind-lift is always the
**counterpart's** window (i.e., to decide whether passenger R is revealed to the
driver, check if the driver's window has expired).

> The `trip` table does not currently store `completed_at`. A
> `completed_at timestamp` column must be added to `trip` as part of this
> feature's migration (additive change).

---

### `trip_review_tag`

Junction table recording which tags were applied to a specific review.

```
trip_review_tag
├── id          uuid          PK, random
├── review_id   uuid          NOT NULL — FK → trip_review.id (CASCADE DELETE)
├── tag_key     varchar(60)   NOT NULL — FK → review_tag.key
└── UNIQUE (review_id, tag_key)
```

**Indexes**: B-tree on `review_id` (bulk-fetch tags for a review or batch of
reviews).

**Notes**:

- No FK on `tag_key → review_tag.key` in the schema — the API validates tag keys
  against the `review_tag` lookup before insert. This avoids cascading issues if
  a tag is retired.
- Tag direction validation is enforced at the API layer: submitted tag keys must
  have `direction` matching the review's direction or `"both"`.

---

## Additive Change to Existing Table: `trip`

The `trip` table gains one column:

```diff
+ completed_at   timestamp   nullable — set when status transitions to "completed"
```

This column is required for the double-blind window calculation. It is set in
the same transaction that transitions `trip.status → "completed"`. Existing rows
have `NULL` completed_at; the blind-lift logic treats NULL as "window possibly
still open" and falls back to `IS NULL → not visible` to avoid leaking old
reviews unexpectedly.

---

## Additive Change to Existing Constraint: `points_ledger`

A composite unique constraint is added to `points_ledger`:

```sql
UNIQUE (account_id, source_action, reference_id)
```

`reference_id` for a review ledger entry is the `trip_review.id` UUID. This
ensures that if the gamification hook fires twice for the same review (network
retry, duplicate event), the second insert is rejected silently — points are
never double-awarded.

---

## Badge Seed Data

Eight new badges are inserted into the `badge` table. All use
`applicable_to = "passenger"` or `"operator"` as noted.

### Reviewer Badges (earned by reviewing)

| Key                       | Name                | Description                                            | Applies To |
| ------------------------- | ------------------- | ------------------------------------------------------ | ---------- |
| `first_review`            | First Impression    | You left your first rating — others will thank you     | both       |
| `tagged_reviewer`         | Attention to Detail | You've used tags in 5 reviews — detail matters         | both       |
| `dedicated_reviewer`      | Dedicated Reviewer  | You've reviewed 25 trips — you're shaping the platform | both       |
| `veteran_reviewer`        | Review Veteran      | 100 reviews submitted — true community builder         | both       |
| `perfect_streak_reviewer` | On a Roll           | Reviewed every one of your last 7 trips                | both       |

### Reputation Badges (earned by being well-reviewed)

| Key                   | Name              | Description                                      | Applies To |
| --------------------- | ----------------- | ------------------------------------------------ | ---------- |
| `top_rated_driver`    | Top Rated Driver  | 4.8+ average across 50 or more trip reviews      | operator   |
| `consistent_driver`   | Consistent Driver | 50+ reviews with no 1-star ratings               | operator   |
| `five_star_passenger` | Five-Star Rider   | 4.8+ average across 20 or more passenger reviews | passenger  |

---

## Points Calculation Reference

Stored in the application tier (`api/src/reviews/calculatePoints.ts`), not in
the database. The `points_awarded` column on `trip_review` reflects the output
of this function at submission time.

```
calculateReviewPoints(input: ReviewInput): number
  base = 10
  tagBonus  = (input.tags.length >= 2)       ? 5  : 0
  commentBonus = (input.comment?.trim().length > 0) ? 10 : 0
  return base + tagBonus + commentBonus   // max: 25
```

---

## Entity Relationship Summary

```
user ──< trip_review (reviewer)
user ──< trip_review (reviewee)
trip ──< trip_review >── trip_review_tag >── review_tag
user ──< points_ledger (review_submitted entries)
user ──< user_badge    (reviewer + reputation badges)
```
