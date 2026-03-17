# REST API Contracts: Gamified Review & Rating System

**Feature**: 011-gamified-review-rating  
**Last updated**: 2026-03-16

All endpoints require authentication via `getSessionFromRequest` unless
explicitly stated otherwise. Request/response types live in `@hakwa/types`.

**Base URL**: `/api/v1/reviews`

---

## Error Codes

All error codes are defined in `@hakwa/errors`.

| Code                        | HTTP | Description                                                           |
| --------------------------- | ---- | --------------------------------------------------------------------- |
| `REVIEW_ALREADY_SUBMITTED`  | 409  | A review in this direction already exists for this trip               |
| `REVIEW_TRIP_NOT_FOUND`     | 404  | The trip does not exist or does not belong to the caller              |
| `REVIEW_WINDOW_CLOSED`      | 410  | The review window for this trip has elapsed                           |
| `REVIEW_TRIP_NOT_COMPLETED` | 422  | The trip has not yet reached `completed` status                       |
| `REVIEW_INVALID_RATING`     | 422  | `rating` must be an integer between 1 and 5 (inclusive)               |
| `REVIEW_INVALID_TAG`        | 422  | One or more tag keys are unknown or do not match the review direction |
| `REVIEW_COMMENT_TOO_LONG`   | 422  | Comment exceeds 280 characters after trimming                         |
| `REVIEW_NOT_PARTICIPANT`    | 403  | Caller was not the passenger or driver on this trip                   |
| `REVIEW_USER_NOT_FOUND`     | 404  | User profile requested does not exist                                 |

---

## Review Tags (Lookup)

### `GET /reviews/tags`

Returns all available review tags. The client uses `direction` to filter which
chips to show on Step 2 of the review card.

**Auth**: Required.

**Query parameters**:

| Parameter   | Type   | Required | Description                                                     |
| ----------- | ------ | -------- | --------------------------------------------------------------- |
| `direction` | string | No       | `passenger_to_driver` \| `driver_to_passenger` — filter results |

**Response `200 OK`**:

```json
{
  "tags": [
    {
      "key": "safe_driver",
      "label": "Safe driver",
      "icon": "🛡️",
      "direction": "passenger_to_driver",
      "sortOrder": 1
    },
    {
      "key": "friendly",
      "label": "Friendly",
      "icon": "😊",
      "direction": "both",
      "sortOrder": 2
    }
  ]
}
```

> Tags with `direction = "both"` appear in both passenger→driver and
> driver→passenger flows. Tags with `direction = "passenger_to_driver"` whose
> `key` is `late_arrival` (or any future negative tag) are only included in the
> response when the client explicitly requests them with
> `?includeNegative=true`.

---

## Submitting a Review

### `POST /reviews`

Submits a review for a completed trip. A single call covers all three steps
(stars + tags + comment). The client collects all inputs before calling — there
is no partial-submit endpoint.

**Auth**: Required.  
**Caller must be** the passenger or driver on the specified trip.

**Request body**:

```json
{
  "tripId": "uuid",
  "rating": 5,
  "tagKeys": ["safe_driver", "on_time"],
  "comment": "Super smooth ride, would definitely book again!"
}
```

| Field     | Type     | Required | Validation                                                            |
| --------- | -------- | -------- | --------------------------------------------------------------------- |
| `tripId`  | string   | Yes      | Must be a valid UUID of a `completed` trip the caller participated in |
| `rating`  | integer  | Yes      | 1–5 inclusive                                                         |
| `tagKeys` | string[] | No       | Each key must exist in `review_tag` and match the review direction    |
| `comment` | string   | No       | 1–280 chars after trimming; whitespace-only treated as absent         |

**Response `201 Created`**:

```json
{
  "review": {
    "id": "uuid",
    "tripId": "uuid",
    "direction": "passenger_to_driver",
    "rating": 5,
    "tagKeys": ["safe_driver", "on_time"],
    "comment": "Super smooth ride, would definitely book again!",
    "pointsAwarded": 15,
    "submittedAt": "2026-03-16T10:30:00Z"
  },
  "pointsBreakdown": {
    "base": 10,
    "tagBonus": 5,
    "commentBonus": 0,
    "total": 15
  },
  "badgesAwarded": [
    {
      "key": "first_review",
      "name": "First Impression",
      "iconUrl": "https://cdn.hakwa.app/badges/first_review.png"
    }
  ],
  "newTotalPoints": 385,
  "missionProgress": {
    "weeklyReviewMission": {
      "target": 3,
      "completed": 2,
      "bonusPoints": 50,
      "missionComplete": false
    }
  }
}
```

**Notes**:

- `pointsBreakdown` drives the celebration animation on the client.
- `badgesAwarded` is an array of badges earned as a result of this review (may
  be empty).
- `newTotalPoints` is the caller's updated `pointsAccount.totalPoints` after
  this submission — avoids a separate profile fetch to update the header
  counter.
- `missionProgress` is included if a weekly review mission is active. If the
  mission completes with this review, `missionComplete: true` and an additional
  50-point `points_ledger` entry has already been created server-side.

---

## Reading Trip Reviews

### `GET /reviews/trip/:tripId`

Returns reviews for a specific trip. Double-blind rules are enforced: reviews
not yet visible to the caller are omitted from the response.

**Auth**: Required.  
**Caller must be** the passenger or driver on the specified trip.

**Path parameters**:

| Parameter | Type   | Description      |
| --------- | ------ | ---------------- |
| `tripId`  | string | UUID of the trip |

**Response `200 OK`**:

```json
{
  "tripId": "uuid",
  "reviews": [
    {
      "id": "uuid",
      "direction": "passenger_to_driver",
      "rating": 5,
      "tagKeys": ["safe_driver", "on_time"],
      "comment": "Super smooth ride!",
      "submittedAt": "2026-03-16T10:30:00Z",
      "isOwnReview": true
    }
  ],
  "pendingDirections": ["driver_to_passenger"],
  "reviewWindowExpiresAt": {
    "passenger_to_driver": "2026-03-19T09:00:00Z",
    "driver_to_passenger": "2026-03-17T09:00:00Z"
  }
}
```

- `pendingDirections`: directions for which a review has not yet been submitted
  and the window is still open — used by the client to show a subtle reminder
  indicator.
- `reviewWindowExpiresAt`: expiry timestamps for each direction, allowing the
  client to render a countdown if desired.
- Reviews still within the double-blind hold are completely absent from the
  `reviews` array (not returned as redacted/empty objects).

---

## User Reputation

### `GET /reviews/me`

Returns the authenticated user's reputation summary as a reviewee (their
received-review aggregates).

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "userId": "uuid",
  "role": "passenger",
  "reputation": {
    "averageRating": 4.9,
    "totalReviewsReceived": 37,
    "ratingBreakdown": {
      "5": 31,
      "4": 5,
      "3": 1,
      "2": 0,
      "1": 0
    },
    "topTags": [
      {
        "key": "friendly",
        "label": "Friendly",
        "icon": "😊",
        "frequency": 0.89
      },
      {
        "key": "ready_on_time",
        "label": "Ready on time",
        "icon": "⏱️",
        "frequency": 0.78
      }
    ],
    "recentComments": [],
    "badges": [
      {
        "key": "five_star_passenger",
        "name": "Five-Star Rider",
        "awardedAt": "2026-03-01T00:00:00Z"
      }
    ]
  },
  "reviewerStats": {
    "totalReviewsSubmitted": 34,
    "taggedReviewsSubmitted": 28,
    "reviewsThisWeek": 2
  }
}
```

- `recentComments`: for a `passenger` role the array is empty (comments on
  passenger reviews are not displayed publicly).
- `reviewerStats`: the caller's own submitting behaviour — used by the client to
  render mission progress and badge eligibility hints.

---

### `GET /reviews/user/:userId`

Returns another user's **public** reputation summary. Sensitive data is omitted.

**Auth**: Required.

**Path parameters**:

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `userId`  | string | ID of the user to look up |

**Response `200 OK`** (driver example):

```json
{
  "userId": "uuid",
  "role": "operator",
  "displayName": "Josaia T.",
  "reputation": {
    "averageRating": 4.8,
    "totalReviewsReceived": 142,
    "ratingBreakdown": {
      "5": 115,
      "4": 21,
      "3": 5,
      "2": 1,
      "1": 0
    },
    "topTags": [
      {
        "key": "safe_driver",
        "label": "Safe driver",
        "icon": "🛡️",
        "frequency": 0.94
      },
      { "key": "on_time", "label": "On time", "icon": "⏱️", "frequency": 0.87 },
      {
        "key": "friendly",
        "label": "Friendly",
        "icon": "😊",
        "frequency": 0.81
      }
    ],
    "recentComments": [
      {
        "comment": "Best driver I've had on this platform.",
        "rating": 5,
        "submittedAt": "2026-03-15T14:22:00Z"
      }
    ],
    "badges": [
      {
        "key": "top_rated_driver",
        "name": "Top Rated Driver",
        "awardedAt": "2026-02-10T00:00:00Z"
      }
    ]
  }
}
```

- `reviewer_user_id` is never exposed — reviewer comments appear anonymously ("A
  passenger").
- `recentComments`: last 5 written comments, most recent first, anonymised.
  **Only shown for drivers** — passenger reviews are B2C private.
- `ratingBreakdown` keys are stringified integers `"1"` through `"5"`.
- If `totalReviewsReceived < 3`, `averageRating` is omitted from the response
  and the client renders "New [role]".

---

## Driver Reputation Dashboard

### `GET /reviews/me/dashboard`

Extended driver-only view with historical chart data and actionable feedback
annotations. Available only when `session.role === "operator"`.

**Auth**: Required (operator role only).

**Response `200 OK`**:

```json
{
  "averageRating": 4.8,
  "totalReviewsReceived": 142,
  "monthlyAverages": [
    { "month": "2025-10", "average": 4.7, "reviewCount": 19 },
    { "month": "2025-11", "average": 4.9, "reviewCount": 22 },
    { "month": "2025-12", "average": 4.8, "reviewCount": 25 },
    { "month": "2026-01", "average": 4.8, "reviewCount": 28 },
    { "month": "2026-02", "average": 4.9, "reviewCount": 24 },
    { "month": "2026-03", "average": 4.7, "reviewCount": 24 }
  ],
  "tagFrequencies": [
    { "key": "safe_driver", "count": 133, "frequency": 0.94 },
    { "key": "on_time", "count": 124, "frequency": 0.87 },
    { "key": "friendly", "count": 115, "frequency": 0.81 },
    { "key": "late_arrival", "count": 8, "frequency": 0.06 }
  ],
  "annotations": [
    {
      "tagKey": "late_arrival",
      "message": "8 recent passengers mentioned 'Late arrival' — check your estimated arrival time.",
      "severity": "warning"
    }
  ],
  "reputationBadges": [
    {
      "key": "top_rated_driver",
      "name": "Top Rated Driver",
      "awardedAt": "2026-02-10T00:00:00Z"
    }
  ]
}
```

- `monthlyAverages`: 6 calendar months ending with the current month, most
  recent last.
- `annotations`: generated server-side based on tag frequency of negative tags.
  An annotation is generated when a negative tag appears in > 5% of the most
  recent 30 reviews (configurable threshold).
- `annotations[].severity`: `"info"` | `"warning"` | `"critical"`. Currently
  only `"warning"` is used. `"critical"` is reserved for abuse signals.

---

## Booking Request Passenger Signal

### `GET /reviews/passenger-signal/:userId`

Returns a minimal reputation object for use on the driver's booking-request
card. Returns a fast, cached read (30-second TTL).

**Auth**: Required (operator role only).

**Response `200 OK`**:

```json
{
  "userId": "uuid",
  "averageRating": 4.9,
  "totalReviewsReceived": 37,
  "label": "4.9 ★"
}
```

If `totalReviewsReceived < 3`:

```json
{
  "userId": "uuid",
  "averageRating": null,
  "totalReviewsReceived": 1,
  "label": "New rider"
}
```

This endpoint is designed for low latency. It must respond within 100 ms p95.
Caching at the application layer (Redis or in-process) is mandatory for
production.

---

## Rider Matching Driver Signal

### `GET /reviews/driver-signal/:userId`

Returns a minimal driver reputation object for use on rider-facing matching and
driver-card previews.

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "userId": "uuid",
  "averageRating": 4.8,
  "totalReviewsReceived": 142,
  "label": "4.8 ★"
}
```

If `totalReviewsReceived < 3`:

```json
{
  "userId": "uuid",
  "averageRating": null,
  "totalReviewsReceived": 1,
  "label": "New driver"
}
```

This endpoint is designed for low latency in matching flows and should use the
same short-lived caching strategy as passenger signal endpoints.

---

## Notification Hooks (Server-side, no direct API)

The following events trigger push notifications via the notification system
(spec 008) and do not have dedicated REST endpoints:

| Event                        | Recipient            | Message template                                                                |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| Review window closing (−6 h) | Reviewer             | "Rate your trip with [Name] and earn up to 25 pts — offer closes in 6 hours."   |
| Badge awarded                | Badge earner         | "🏅 You earned the [Badge Name] badge!"                                         |
| Reputation badge revoked     | Badge loser (driver) | "Your [Badge Name] badge has been removed. Keep up the effort to earn it back." |
| Weekly mission complete      | Mission completer    | "Mission complete 🎯 — you reviewed 3 trips this week! +50 bonus points."       |
