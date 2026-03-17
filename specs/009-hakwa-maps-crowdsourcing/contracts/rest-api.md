# REST API Contracts: Hakwa Maps — Crowdsourced Data Collection

**Feature**: 009-hakwa-maps-crowdsourcing  
**Last updated**: 2026-03-16

All endpoints are authenticated (session required via `getSessionFromRequest`).
Request/response types live in `@hakwa/types` and are imported by both `api/`
and frontend apps.

**Base URL**: `/api/v1/map`

**Error codes** (all defined in `@hakwa/errors`):

| Code                          | HTTP | Description                                                                  |
| ----------------------------- | ---- | ---------------------------------------------------------------------------- |
| `MAP_OUT_OF_BOUNDS`           | 422  | Coordinates fall outside the Fiji bounding box                               |
| `MAP_GPS_ACCURACY_TOO_LOW`    | 422  | Submitted GPS accuracy exceeded 50 m                                         |
| `MAP_DAILY_LIMIT_REACHED`     | 429  | User hit the 20 contributions/day cap                                        |
| `MAP_ALREADY_VOTED`           | 409  | User already cast a vote on this feature                                     |
| `MAP_CANNOT_VERIFY_OWN`       | 403  | Contributor attempted to verify their own submission                         |
| `MAP_VOTING_CLOSED`           | 409  | Feature is no longer in a state that accepts votes or reports                |
| `MAP_PHOTO_TOO_LARGE`         | 413  | Photo upload exceeds 5 MB limit                                              |
| `MAP_FEATURE_NOT_FOUND`       | 404  | `mapFeature` with given ID does not exist                                    |
| `MAP_CONTENT_VIOLATION`       | 422  | Submission rejected by automated content screener (`auto_reject` outcome)    |
| `MAP_USER_MAP_BANNED`         | 403  | User is currently map-banned and may not contribute or verify                |
| `MAP_ALREADY_REPORTED`        | 409  | User has already submitted a report on this feature                          |
| `MAP_CANNOT_REPORT_OWN`       | 403  | Contributor attempted to report their own submission                         |

---

## `POST /map/features` — Submit a Map Contribution

Creates a new `mapFeature` and awards `MAP_POINTS_CONTRIBUTION` (25 pts) to the
submitter **if** the content screener returns `pass`. If the screener returns
`flag`, the feature is created with `status = "pending_review"` and points are
withheld until an admin clears it (FR-028, FR-029). If the screener returns
`auto_reject`, the request is rejected with `422 MAP_CONTENT_VIOLATION` and no
row is created.

**Auth**: Required.  
**Rate limit**: 20 requests per user per UTC day.

**Request body**:

```json
{
  "type": "poi",
  "name": "Municipal Market Stall Row B",
  "category": "market",
  "description": "Fresh produce market, open Mon–Sat 6am–4pm",
  "geometry": {
    "type": "Point",
    "coordinates": [178.4415, -18.1416]
  },
  "photoUrl": "https://cdn.hakwa.com/map-photos/uuid.jpg",
  "gpxAccuracyM": 8.3,
  "osmRef": null
}
```

| Field          | Type            | Required | Validation                                                             |
| -------------- | --------------- | -------- | ---------------------------------------------------------------------- |
| `type`         | string enum     | Yes      | `poi` \| `road_correction` \| `area` \| `route_stop`                   |
| `name`         | string          | Yes      | 1–200 chars                                                            |
| `category`     | string enum     | Yes      | See allowed category list in spec                                      |
| `description`  | string          | No       | Max 1 000 chars                                                        |
| `geometry`     | GeoJSON object  | Yes      | `Point`, `LineString`, or `Polygon`; coordinates within Fiji bbox; max 6 decimal places |
| `photoUrl`     | string (URL)    | No       | Must be a trusted CDN domain. Binary uploads rejected.                 |
| `gpxAccuracyM` | number          | No       | Must be ≤ 50 when provided                                             |
| `osmRef`       | string          | No       | OSM node/way/relation ID string (e.g., `"node/1234567"`)               |

**Response `201 Created`**:

```json
{
  "featureId": "uuid",
  "status": "pending",
  "pointsAwarded": 25,
  "totalPoints": 340,
  "underReview": false,
  "proximityWarning": {
    "exists": true,
    "nearbyFeatureId": "uuid",
    "distanceM": 6.1
  }
}
```

> `status` is `"pending"` when the content screener passes, or `"pending_review"`
> when the screener flags the submission (points withheld, admin review required).
> `underReview` is `true` only when `status = "pending_review"`. In this case
> `pointsAwarded` is `0` — points will be awarded if an admin later approves the
> submission. `proximityWarning` is `null` when no same-type feature exists within
> 10 m. The warning is informational — the submission is still accepted.

**Error Responses**: `401`, `403 MAP_USER_MAP_BANNED`, `422 MAP_OUT_OF_BOUNDS`,
`422 MAP_GPS_ACCURACY_TOO_LOW`, `422 MAP_CONTENT_VIOLATION`,
`429 MAP_DAILY_LIMIT_REACHED`.

---

## `GET /map/features/pending` — List Pending Contributions

Returns paginated pending `mapFeature` records filtered by bounding box, type,
and/or age. Ordered by `createdAt` ascending (oldest first) by default.

**Auth**: Required.  
**Caching**: Not cached — response is live data to ensure verifiers see fresh submissions.

**Query parameters**:

| Param      | Type    | Required | Description                                                                      |
| ---------- | ------- | -------- | -------------------------------------------------------------------------------- |
| `bbox`     | string  | Yes      | `minLat,minLng,maxLat,maxLng` — defines the viewport bounding box                |
| `type`     | string  | No       | Filter by feature type: `poi` \| `road_correction` \| `area` \| `route_stop`    |
| `sort`     | string  | No       | `oldest` (default) \| `newest` \| `most_confirmed` \| `most_disputed`           |
| `cursor`   | string  | No       | Opaque cursor for keyset pagination                                              |
| `limit`    | integer | No       | Results per page. Default: 20. Max: 50.                                          |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "poi",
      "name": "Municipal Market Stall Row B",
      "category": "market",
      "description": "Fresh produce market, open Mon–Sat 6am–4pm",
      "geometry": { "type": "Point", "coordinates": [178.4415, -18.1416] },
      "photoUrl": "https://cdn.hakwa.com/map-photos/uuid.jpg",
      "status": "pending",
      "confirmCount": 1,
      "disputeCount": 0,
      "contributorDisplayName": "Amelia T.",
      "isOwnContribution": false,
      "hasVoted": false,
      "createdAt": "2026-03-15T08:22:00Z"
    }
  ],
  "nextCursor": "string | null",
  "totalCount": 42
}
```

> `contributorDisplayName` is `"{firstName} {lastInitial}."` — never the full name.
> `isOwnContribution` is `true` if the requesting user submitted this feature.
> `hasVoted` is `true` if the requesting user has already cast a vote.

**Error Responses**: `401`, `422` (invalid bbox format).

---

## `GET /map/features/active` — Active Features GeoJSON Layer

Returns all active `mapFeature` records as a GeoJSON `FeatureCollection` for
rendering as a map overlay in `@hakwa/map`. Served from a Redis cache
(TTL 60 s).

**Auth**: Required.  
**Caching**: Redis key `map:active-features:geojson`, TTL 60 s. Invalidated on
any `mapFeature` status transition to/from `active`.

**Query parameters**:

| Param      | Type    | Required | Description                                                  |
| ---------- | ------- | -------- | ------------------------------------------------------------ |
| `bbox`     | string  | No       | Constrain results to bounding box. Same format as above.     |
| `type`     | string  | No       | Filter by feature type                                       |
| `category` | string  | No       | Filter by POI category                                       |

**Response `200 OK`** (GeoJSON):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "uuid",
      "geometry": { "type": "Point", "coordinates": [178.4415, -18.1416] },
      "properties": {
        "name": "Municipal Market Stall Row B",
        "category": "market",
        "featureType": "poi",
        "description": "Fresh produce market, open Mon–Sat 6am–4pm",
        "photoUrl": "https://cdn.hakwa.com/map-photos/uuid.jpg",
        "osmRef": null,
        "activatedAt": "2026-03-15T12:00:00Z"
      }
    }
  ]
}
```

**Error Responses**: `401`.

---

## `POST /map/features/:id/verify` — Cast a Verification Vote

Casts a `confirm` or `dispute` vote on a pending `mapFeature`. Awards
`MAP_POINTS_VERIFICATION` (5 pts) to the voter. If the vote tips the feature
over `MAP_ACTIVATION_THRESHOLD` or `MAP_REJECTION_THRESHOLD`, the status
transition is executed atomically in the same transaction.

**Auth**: Required.  
**Rate limit**: 200 verification requests per user per UTC day.

**Path parameter**: `id` — `mapFeature` UUID.

**Request body**:

```json
{
  "vote": "confirm",
  "note": null,
  "disputeCategory": null
}
```

| Field             | Type   | Required | Validation                                                                                 |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------ |
| `vote`            | string | Yes      | `"confirm"` \| `"dispute"`                                                                 |
| `note`            | string | No       | Max 500 chars                                                                              |
| `disputeCategory` | string | No       | `"harmful_content"` \| `"dangerous_info"` \| `"spam"` \| `"duplicate"`; `null` if omitted |

> `disputeCategory` is accepted from any user but only triggers the instant
> `under_review` escalation when the caller holds the `trusted` or `senior`
> trust tier and the category is `"harmful_content"` or `"dangerous_info"`
> (FR-036).

**Response `200 OK`**:

```json
{
  "featureId": "uuid",
  "vote": "confirm",
  "newStatus": "pending",
  "confirmCount": 2,
  "disputeCount": 0,
  "pointsAwarded": 5,
  "totalPoints": 345,
  "activated": false,
  "escalated": false
}
```

> `activated` is `true` when this vote tipped the feature to `active`. In that
> case, the contributor receives a separate `map_contribution_accepted` ledger
> entry and push notification — the verifier's response does not change.
> `escalated` is `true` when a trusted/senior contributor's dispute category
> caused an immediate `under_review` transition.
> `newStatus` reflects the feature status after this vote (`pending`, `active`,
> `rejected`, or `under_review`).

**Error Responses**: `401`, `403 MAP_USER_MAP_BANNED`, `403 MAP_CANNOT_VERIFY_OWN`,
`404 MAP_FEATURE_NOT_FOUND`, `409 MAP_ALREADY_VOTED`, `409 MAP_VOTING_CLOSED`.

---

## `GET /map/leaderboard` — Monthly Map Leaderboard

Returns the top `MAP_LEADERBOARD_TOP_N` (50) users by map points earned in the
current calendar month, plus the requesting user's own rank if they fall outside
the top 50. Data is served from the `map:leaderboard:monthly:{YYYY-MM}` Redis
sorted set.

**Auth**: Required.  
**Caching**: Read from Redis sorted set — no additional cache layer needed.

**Query parameters**:

| Param  | Type   | Required | Description                                             |
| ------ | ------ | -------- | ------------------------------------------------------- |
| `month`| string | No       | `YYYY-MM` format. Defaults to current month.            |

**Response `200 OK`**:

```json
{
  "month": "2026-03",
  "entries": [
    {
      "rank": 1,
      "userId": "uuid",
      "displayName": "Leilani V.",
      "totalMapPoints": 1250,
      "contributionCount": 18,
      "verificationCount": 76,
      "acceptedCount": 14
    }
  ],
  "callerRank": {
    "rank": 63,
    "totalMapPoints": 85,
    "contributionCount": 2,
    "verificationCount": 15,
    "acceptedCount": 1
  }
}
```

> `callerRank` is `null` if the requesting user has zero map activity for the
> month. `callerRank` is omitted from `entries` when caller is already in top 50.

**Error Responses**: `401`, `422` (invalid month format).

---

## `GET /map/features/:id` — Get a Single Feature

Returns full details for any `mapFeature` regardless of status. Used for deep-
link sharing and the verification preview card.

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "id": "uuid",
  "type": "poi",
  "name": "Municipal Market Stall Row B",
  "category": "market",
  "description": "Fresh produce market, open Mon–Sat 6am–4pm",
  "geometry": { "type": "Point", "coordinates": [178.4415, -18.1416] },
  "photoUrl": "https://cdn.hakwa.com/map-photos/uuid.jpg",
  "status": "pending",
  "confirmCount": 1,
  "disputeCount": 0,
  "osmRef": null,
  "osmLicence": "ODbL",
  "gpxAccuracyM": 8.3,
  "contributorDisplayName": "Amelia T.",
  "isOwnContribution": false,
  "hasVoted": false,
  "createdAt": "2026-03-15T08:22:00Z",
  "updatedAt": "2026-03-15T09:10:00Z"
}
```

**Error Responses**: `401`, `404 MAP_FEATURE_NOT_FOUND`.

---

## `GET /map/stats/me` — Caller's Contribution Stats

Returns the requesting user's `mapContributorStats` record plus their current
month map points (from Redis), and any active weekly missions with their progress.

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "totalContributions": 12,
  "acceptedContributions": 9,
  "totalVerifications": 38,
  "mapStreak": 4,
  "rideImpactCount": 47,
  "currentMonthMapPoints": 85,
  "trustTier": "trusted",
  "isMapBanned": false,
  "badges": [
    { "key": "map_first_contribution", "name": "First Mapper", "awardedAt": "2026-03-10T08:00:00Z" }
  ]
}
```

> `trustTier` is `"standard"` (default), `"trusted"` (≥ 5 accepted, no ban),
> or `"senior"` (≥ 20 accepted, no ban). It is computed dynamically — never
> cached. `isMapBanned` is `true` only while an active ban is in force; expired
> bans are auto-lifted on the same request that reads them (FR-038).

**Error Responses**: `401`.

---

## `GET /map/missions` — Active Weekly Missions

Returns the three active missions for the current week plus the calling user's
progress on each.

**Auth**: Required.

**Response `200 OK`**:

```json
{
  "weekStart": "2026-03-16",
  "deadline": "2026-03-22T23:59:59Z",
  "allCompleted": false,
  "bonusPoints": 100,
  "missions": [
    {
      "id": "uuid",
      "actionType": "contribute_poi",
      "targetCount": 3,
      "zoneName": null,
      "progressCount": 1,
      "status": "in_progress"
    },
    {
      "id": "uuid",
      "actionType": "verify_features",
      "targetCount": 10,
      "zoneName": "Nadi Town",
      "progressCount": 10,
      "status": "completed"
    },
    {
      "id": "uuid",
      "actionType": "contribute_with_photo",
      "targetCount": 2,
      "zoneName": null,
      "progressCount": 0,
      "status": "in_progress"
    }
  ]
}
```

**Notes**:
- `allCompleted: true` is set once all three missions for the week are in
  `completed` status (i.e., the bonus has already been awarded).
- If the caller has no `mapMissionProgress` rows for the current week (new
  week, no activity yet), all `progressCount` values are 0.

**Error Responses**: `401`.

---

## `GET /map/zones` — Neighbourhood Progress

Returns all `mapZone` rows with their current completion percentage and
(optionally) the top 3 contributors for each.

**Auth**: Required.

**Query Parameters**:
| Parameter | Type    | Required | Description                                   |
| --------- | ------- | -------- | --------------------------------------------- |
| `detail`  | boolean | No       | If `true`, include `topContributors` per zone |

**Response `200 OK`**:

```json
{
  "zones": [
    {
      "id": "uuid",
      "slug": "suva-cbd",
      "displayName": "Suva CBD",
      "completionPct": 42,
      "currentFeatureCount": 126,
      "targetFeatureCount": 300,
      "topContributors": [
        { "userId": "u1", "displayName": "Josaia K.", "acceptedContributions": 34 }
      ]
    }
  ]
}
```

**Caching**: Response SHOULD be served from Redis (`map:zones:list`) with a
60-second TTL. Cache is invalidated on any zone counter update.

**Error Responses**: `401`.

---

## `GET /map/zones/:slug` — Single Zone Detail

**Auth**: Required.

**Path Parameter**: `slug` — e.g. `suva-cbd`.

**Response `200 OK`**:

```json
{
  "id": "uuid",
  "slug": "suva-cbd",
  "displayName": "Suva CBD",
  "completionPct": 42,
  "currentFeatureCount": 126,
  "targetFeatureCount": 300,
  "pioneer": {
    "userId": "u7",
    "displayName": "Amelia T.",
    "since": "2026-03-12T10:00:00Z"
  },
  "topContributors": [
    { "userId": "u1", "displayName": "Josaia K.", "acceptedContributions": 34 },
    { "userId": "u2", "displayName": "Rangi P.", "acceptedContributions": 22 },
    { "userId": "u7", "displayName": "Amelia T.", "acceptedContributions": 18 }
  ]
}
```

**Notes**:
- `pioneer` is `null` if `currentFeatureCount >= MAP_PIONEER_MAX_KNOWN_COUNT` (10).

**Error Responses**: `401`, `404` (unknown slug).

---

## `POST /map/trace` — Submit Passive Road Trace

Accepts a GPS trace from an opted-in driver's completed trip. Called by the
Driver App after the road-trace worker has processed the trace server-side.
The client only needs to submit the raw trace; the server performs all novelty
detection and points calculation.

**Auth**: Required. Caller MUST have role `operator` (vehicle operator: driver, captain, biker, etc.). Returns `403`
for passengers.

**Request Body**:

```json
{
  "tripId": "uuid",
  "traceGeoJson": {
    "type": "LineString",
    "coordinates": [[178.441, -18.141], [178.443, -18.140]]
  }
}
```

**Validation**:
- `tripId` MUST reference a `trip` row owned by the calling driver with
  `status = "completed"`.
- `traceGeoJson` MUST be a valid GeoJSON LineString with at least 2 coordinates.
- Each coordinate pair MUST lie within the Fiji bounding box (`FIJI_BBOX`).
- If the driver has not opted into passive tracing in their settings, returns
  `403 Forbidden` with code `MAP_TRACE_OPT_IN_REQUIRED`.

**Response `201 Created`**:

```json
{
  "novelKm": 4.2,
  "pointsAwarded": 4,
  "dailyCapReached": false
}
```

**Notes**:
- If `dailyCapReached: true`, `pointsAwarded` will be 0.
- `traceGeoJson` coordinates are never echoed back in any response.

**Error Responses**: `400` (invalid geometry), `401`, `403` (wrong role or
opt-in missing), `409` (trace for this `tripId` already submitted).

---

## `POST /map/features/:id/report` — Report a Map Feature

Submits a community report on a `pending` or `active` feature. Each user may
report the same feature only once. When the distinct reporter count reaches
`MAP_REPORT_AUTO_REVIEW_THRESHOLD` (3), the feature automatically transitions
to `under_review` and is removed from all map layers (FR-030, FR-031).

**Auth**: Required.  
**Rate limit**: 50 reports per user per UTC day (prevents spam reporting).

**Path parameter**: `id` — `mapFeature` UUID.

**Request body**:

```json
{
  "reason": "incorrect_info",
  "note": "This market closed down in 2025"
}
```

| Field    | Type   | Required | Validation                                                                        |
| -------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `reason` | string | Yes      | `"harmful_content"` \| `"incorrect_info"` \| `"no_longer_exists"` \| `"duplicate"` |
| `note`   | string | No       | Max 500 chars                                                                     |

**Response `201 Created`**:

```json
{
  "reportId": "uuid",
  "featureId": "uuid",
  "status": "open",
  "underReviewNow": false
}
```

> `underReviewNow: true` indicates that this report triggered the threshold and
> the feature has just transitioned to `under_review`. The caller's UI should
> display _"Thanks — this feature is now under review."_

**Error Responses**: `401`, `403 MAP_CANNOT_REPORT_OWN`, `404 MAP_FEATURE_NOT_FOUND`,
`409 MAP_ALREADY_REPORTED`, `409 MAP_VOTING_CLOSED` (feature not in `pending`
or `active` state).

---

## `GET /admin/map/moderation/queue` — Admin Moderation Queue

Returns features currently in `pending_review` or `under_review` state,
paginated and sorted oldest-first. Only accessible to users with the `admin` or
`map_moderator` role (NFR-008).

**Auth**: Required. Role `admin` or `map_moderator`.  
**Base URL**: `/api/v1/admin/map`

**Query parameters**:

| Param    | Type    | Required | Description                                                                  |
| -------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `status` | string  | No       | `"pending_review"` \| `"under_review"` \| omit for both                      |
| `cursor` | string  | No       | Keyset pagination cursor                                                     |
| `limit`  | integer | No       | Default 20, max 50                                                           |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "poi",
      "name": "Fake Market XYZ",
      "category": "market",
      "status": "pending_review",
      "gpsVelocityFlag": false,
      "contentFlagReason": "keyword_match",
      "contributorDisplayName": "Amelia T.",
      "contributorId": "uuid",
      "confirmCount": 0,
      "disputeCount": 0,
      "reportCount": 0,
      "createdAt": "2026-03-15T08:22:00Z"
    }
  ],
  "nextCursor": "string | null",
  "totalCount": 7
}
```

> `contentFlagReason` is present only for `pending_review` items:
> `"keyword_match"` or `"velocity_flag"`. For `under_review` items it is `null`.
> `reportCount` is the number of distinct user reports submitted so far.

**Error Responses**: `401`, `403 Forbidden` (insufficient role).

---

## `POST /admin/map/features/:id/moderate` — Apply Moderation Action

Applies a moderation action to a feature in `pending_review` or `under_review`
state, logs it to `mapModerationLog`, and triggers downstream effects (points
award, notifications, bans) as specified in FR-029, FR-033, FR-034, FR-038.

**Auth**: Required. Role `admin` or `map_moderator`.  
**Base URL**: `/api/v1/admin/map`

**Path parameter**: `id` — `mapFeature` UUID.

**Request body**:

```json
{
  "action": "approve",
  "reason": null
}
```

| Field    | Type   | Required | Validation                                                                           |
| -------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `action` | string | Yes      | `"approve"` \| `"reject"` \| `"warn_contributor"` \| `"ban_contributor"`             |
| `reason` | string | No       | Max 1 000 chars — required when `action` is `"reject"`, `"warn_contributor"`, or `"ban_contributor"` |
| `banExpiresAt` | string (ISO-8601) | No | Optional expiry for `ban_contributor`; null = permanent ban         |

**Action effects**:

| Action              | Feature transition              | Points effect                              | Notification to contributor                         |
| ------------------- | ------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `approve`           | `pending_review` → `pending`; `under_review` → `active` | Award withheld points (if `pending_review`) | _"Feature restored — thanks!"_ (if `under_review`) |
| `reject`            | → `rejected`                    | None (no reversal)                         | _"Feature removed after review."_                  |
| `warn_contributor`  | No change                       | None                                       | _"Please review our Community Guidelines."_          |
| `ban_contributor`   | No change to feature            | None                                       | _"Your map access has been suspended."_             |

**Response `200 OK`**:

```json
{
  "featureId": "uuid",
  "action": "approve",
  "newFeatureStatus": "pending",
  "logId": "uuid"
}
```

> `newFeatureStatus` reflects the status immediately after this action.

**Error Responses**: `401`, `403 Forbidden` (insufficient role),
`404 MAP_FEATURE_NOT_FOUND`, `422` (feature not in a moderatable state).

---

## `GET /admin/map/abuse/flags` — Abuse Detection Flags

Returns flagged users from the nightly abuse-detection job, filtered by type
and review status. Used by moderators to investigate voting rings and velocity
clusters.

**Auth**: Required. Role `admin` or `map_moderator`.  
**Base URL**: `/api/v1/admin/map`

**Query parameters**:

| Param        | Type    | Required | Description                                                            |
| ------------ | ------- | -------- | ---------------------------------------------------------------------- |
| `flagType`   | string  | No       | `"voting_ring"` \| `"gps_velocity_cluster"` \| omit for all            |
| `reviewed`   | boolean | No       | `false` (default) = unreviewed only; `true` = reviewed; omit = all    |
| `cursor`     | string  | No       | Keyset pagination cursor                                               |
| `limit`      | integer | No       | Default 20, max 50                                                     |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "flagId": "uuid",
      "userId": "uuid",
      "displayName": "Josefa K.",
      "flagType": "voting_ring",
      "occurrenceCount": 3,
      "lastDetectedAt": "2026-03-16T00:05:00Z",
      "reviewedAt": null
    }
  ],
  "nextCursor": "string | null",
  "totalCount": 5
}
```

**Error Responses**: `401`, `403 Forbidden` (insufficient role).
