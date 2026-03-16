# Data Model: Hakwa Maps — Crowdsourced Data Collection

**Feature**: 009-hakwa-maps-crowdsourcing  
**Schema file**: `pkg/db/schema/map.ts`  
**Last updated**: 2026-03-16

---

## Overview

Three new tables are introduced. All live in `pkg/db/schema/map.ts` and are
exported through `@hakwa/db`.

The `gamification.ts` schema in the same package is extended with seven new
`PointsSourceAction` values and fifteen named constants. No columns are added
to or removed from existing tables — all changes are purely additive.

Four additional tables support the engagement mechanics: `map_zone`,
`map_mission`, `map_mission_progress`, and `map_road_trace`. These also live in
`pkg/db/schema/map.ts`.

---

## New Tables

### `map_feature`

Primary record for every geographic feature submitted by a user.

```
map_feature
├── id                 uuid           PK, random
├── contributor_id     text           FK → user.id (CASCADE DELETE)
├── type               text           "poi" | "road_correction" | "area" | "route_stop"
├── name               varchar(200)   Display name — required
├── category           varchar(100)   "market" | "taxi_stand" | "school" |
│                                     "ferry_terminal" | "bus_stop" | "shop" |
│                                     "hospital" | "police" | "fuel_station" |
│                                     "accommodation" | "restaurant" | "other"
├── description        text           nullable — free-text elaboration
├── geometry_json      text           GeoJSON geometry string (Point/LineString/Polygon)
│                                     Max 6 decimal-place coordinates; validated at API
├── photo_url          text           nullable — CDN URL of evidence photo
├── status             text           "pending" | "active" | "rejected" | "stale"
├── confirm_count      integer        default 0 — confirm votes received
├── dispute_count      integer        default 0 — dispute votes received
├── osm_ref            varchar(50)    nullable — OSM node/way/relation ID for corrections
├── osm_licence        varchar(10)    default "ODbL" — licence tag for upstream contribution
├── gpx_accuracy_m     numeric(6,2)   nullable — GPS accuracy (metres) at submission time
├── created_at         timestamp      not null, default now()
├── updated_at         timestamp      not null, default now()
└── expires_at         timestamp      nullable — set to created_at + 60 days on insert;
                                      cleared when status → "active"
```

**Indexes**:
- B-tree on `status` (frequent filter on `pending` and `active`)
- B-tree on `contributor_id` (contributor history queries)
- B-tree on `created_at` (age-based stale job, leaderboard ordering)

> **PostGIS note**: If the Postgres instance has PostGIS, `geometry_json` SHOULD
> be replaced with a native `geometry(Point, 4326)` / `geometry(Geometry, 4326)`
> column for full spatial-index support. Until PostGIS is confirmed available,
> `geometry_json TEXT` is the safe default. The implementation plan resolves this
> open question.

---

### `map_verification`

One row per user vote on a pending (or re-opened) `map_feature`.

```
map_verification
├── id            uuid        PK, random
├── feature_id    uuid        FK → map_feature.id (CASCADE DELETE)
├── user_id       text        FK → user.id (CASCADE DELETE)
├── vote          text        "confirm" | "dispute"
├── note          text        nullable — explanation (especially for disputes)
└── created_at    timestamp   not null, default now()
```

**Constraints**:
- `UNIQUE (feature_id, user_id)` — prevents double-voting
- Application layer enforces: `user_id ≠ map_feature.contributor_id`

---

### `map_contributor_stats`

Materialised per-user counters. Updated in the same transaction as the relevant
`pointsLedger` write. Avoids full ledger scans for badge evaluation and
leaderboard display.

```
map_contributor_stats
├── id                      uuid      PK, random
├── user_id                 text      FK → user.id (CASCADE DELETE), UNIQUE
├── total_contributions     integer   default 0 — all submissions regardless of outcome
├── accepted_contributions  integer   default 0 — features that reached "active"
├── total_verifications     integer   default 0 — all votes cast (confirm + dispute)
├── map_streak              integer   default 0 — consecutive UTC days with map action
├── map_streak_checkpoint   date      nullable — UTC date of last streak increment
└── updated_at              timestamp not null, default now()
```

---

### `map_zone`

Named geographic zone used for neighbourhood progress and pioneer detection.

```
map_zone
├── id                    uuid          PK, random
├── slug                  varchar(80)   UNIQUE — e.g. "suva-cbd", "nadi-town"
├── display_name          varchar(120)  e.g. "Suva CBD"
├── geometry_json         text          GeoJSON Polygon/MultiPolygon string
├── target_feature_count  integer       not null — completion denominator
├── current_feature_count integer       default 0 — incremented on each feature activation
└── created_at            timestamp     not null, default now()
```

**Indexes**:
- UNIQUE on `slug`
- B-tree on `current_feature_count` (milestone threshold queries)

**Notes**:
- Zones are seeded once (see Migration Notes). The seeding source (manual,
  administrative shapefiles, or algorithmic) is resolved in Open Question 6.
- `current_feature_count` increments are atomic (`UPDATE ... SET
  current_feature_count = current_feature_count + 1 RETURNING
  current_feature_count`) — no application-level lock needed.

---

### `map_mission`

One row per weekly mission slot. Three rows created every Monday UTC midnight.

```
map_mission
├── id            uuid          PK, random
├── week_start    date          not null — Monday of the mission week (UTC)
├── deadline      timestamp     not null — Sunday 23:59:59 UTC of the same week
├── action_type   text          "contribute_poi" | "verify_features" |
│                               "contribute_with_photo" | "contribute_road_trace" | ...
├── target_count  integer       not null — e.g. 3 (complete 3 POIs)
├── zone_id       uuid          nullable — FK → map_zone.id; null = any location
└── points_bonus  integer       not null — points awarded when all 3 in week are done
```

**Constraints**:
- Week is identified by `week_start`; three rows share the same `week_start`.

---

### `map_mission_progress`

Per-user progress on a single mission. Created lazily on first qualifying action.

```
map_mission_progress
├── id              uuid        PK, random
├── mission_id      uuid        FK → map_mission.id (CASCADE DELETE)
├── user_id         text        FK → user.id (CASCADE DELETE)
├── progress_count  integer     default 0
├── status          text        "in_progress" | "completed" | "expired"
└── updated_at      timestamp   not null, default now()
```

**Constraints**:
- `UNIQUE (mission_id, user_id)`

---

### `map_road_trace`

GPS trace from an opted-in driver trip. Used for novel-road detection and
retained for data-quality auditing.

```
map_road_trace
├── id              uuid           PK, random
├── trip_id         uuid           FK → trip.id (SET NULL on delete) — nullable
├── driver_id       text           FK → user.id (CASCADE DELETE)
├── trace_geo_json  text           GeoJSON LineString — raw GPS path
├── novel_km        numeric(8,3)   km of novel road detected
├── points_awarded  integer        pts credited in pointsLedger (0 if daily cap hit)
└── processed_at    timestamp      not null, default now()
```

**Notes**:
- `trace_geo_json` MUST NOT be exposed via any public or partner API endpoint.
- Only stored when driver has opted in (checked before trace is written).

---

## Changes to Existing Tables

### `gamification.ts` — `PointsSourceAction`

The existing discriminated union type gains seven members:

```typescript
// Before (excerpt):
export type PointsSourceAction =
  | "trip_completed"
  | "referral_signup"
  | "referral_trip"
  | "streak_bonus"
  | "badge_awarded"
  | "review_submitted";

// After:
export type PointsSourceAction =
  | "trip_completed"
  | "referral_signup"
  | "referral_trip"
  | "streak_bonus"
  | "badge_awarded"
  | "review_submitted"
  | "map_contribution"          // user submits a new map feature
  | "map_verification"          // user casts a confirm or dispute vote
  | "map_contribution_accepted" // contributor's feature reaches "active"
  | "map_photo_bonus"           // extra reward for photo-backed submission
  | "map_road_trace"            // driver passive GPS trace novel km
  | "map_mission_completed"     // all 3 weekly missions completed
  | "map_pioneer_bonus";        // first to map a zone
```

No other columns are changed on existing tables.

---

## Named Constants

All thresholds and reward values MUST be named exports — never magic numbers.
They live in `@hakwa/core` (platform-agnostic, importable on all targets):

```typescript
// Map points
export const MAP_POINTS_CONTRIBUTION         = 25  as const;
export const MAP_POINTS_VERIFICATION         = 5   as const;
export const MAP_POINTS_ACCEPTED             = 50  as const;
export const MAP_POINTS_PHOTO_BONUS          = 10  as const; // photo-backed submission
export const MAP_POINTS_ROAD_TRACE_PER_KM    = 1   as const; // per km of novel road
export const MAP_POINTS_MISSION_BONUS        = 100 as const; // all 3 weekly missions done
export const MAP_POINTS_PIONEER_BONUS        = 75  as const; // first feature in a zone
export const MAP_POINTS_MAP_STREAK_7         = 35  as const; // 7-day consecutive map streak

// Moderation thresholds
export const MAP_ACTIVATION_THRESHOLD        = 3   as const; // confirms needed → active
export const MAP_REJECTION_THRESHOLD         = 3   as const; // disputes needed → rejected

// Rate limits
export const MAP_DAILY_CONTRIBUTION_LIMIT    = 20  as const; // per user per UTC day
export const MAP_DAILY_VERIFICATION_LIMIT    = 200 as const; // per user per UTC day
export const MAP_ROAD_TRACE_DAILY_CAP_PTS    = 50  as const; // max trace pts/driver/day

// Validation
export const MAP_GPS_MAX_ACCURACY_M          = 50  as const; // max GPS error in metres
export const MAP_PROXIMITY_WARN_M            = 10  as const; // duplicate proximity warning
export const MAP_ROAD_NOVEL_THRESHOLD_M      = 20  as const; // metres from known feature

// Lifecycle
export const MAP_STALE_DAYS                  = 60  as const; // days to stale transition
export const MAP_PIONEER_MAX_KNOWN_COUNT     = 10  as const; // zone size for pioneer label fade

// Missions
export const MAP_MISSIONS_PER_WEEK           = 3   as const;

// Leaderboard
export const MAP_LEADERBOARD_TOP_N           = 50  as const; // entries in public list
export const MAP_LEADERBOARD_TTL_DAYS        = 90  as const; // archive TTL after month end

// Bounding box — Fiji island group (covers antimeridian split)
export const FIJI_BBOX = {
  minLat:  -21.5,
  minLng:  176.5,
  maxLat:  -15.0,
  maxLng:  -179.5, // note: crosses 180° antimeridian
} as const;
```

> The Fiji bounding box already appears implicitly in the mapping principle
> (constitution XVII). Encoding it as a named constant in `@hakwa/core` makes it
> reusable by the API validation, the nightly stale job, and future out-of-bounds
> checks without duplication.

---

## Entity Relationship Summary

```
user ──────────────────────────── points_account
  │                                     │
  │  (contributor_id)                   │ (accountId)
  ▼                                     ▼
map_feature ◄─── map_verification   points_ledger
  │                   │                 (sourceAction: map_*)
  │ (feature_id) ─────┘
  │
  ├─── map_contributor_stats  (user_id — unique per user)
  │
  └─── map_zone  ◄── map_feature (zone membership via point-in-polygon)
         │
         └── map_mission ◄── map_mission_progress (user_id, mission_id)

trip ──► map_road_trace  (driver_id, trip_id — passive tracing)
```

---

## Badge Seed Rows

These rows seed the existing `badge` table (data-driven, no code changes needed
beyond the badge-evaluation worker logic):

| `key`                      | `name`               | `applicableTo`            |
| -------------------------- | -------------------- | ------------------------- |
| `map_first_contribution`   | First Mapper         | `passenger` and `operator` (both) |
| `map_10_accepted`          | Road Builder         | `passenger` and `operator`        |
| `map_50_accepted`          | Local Expert         | `passenger` and `operator`        |
| `map_25_verifications`     | Community Checker    | `passenger` and `operator`        |
| `map_100_verifications`    | Community Guardian   | `passenger` and `operator`        |
| `map_cartographer`         | Cartographer         | `passenger` and `operator`        |
| `map_photo_10`             | Picture Perfect      | `passenger` and `operator`        |
| `map_pioneer`              | First Explorer       | `passenger` and `operator`        |
| `map_explorer`             | Zone Explorer        | `passenger` and `operator`        |
| `map_zone_complete`        | Zone Champion        | `passenger` and `operator`        |
| `map_mission_4_streak`     | Mission Veteran      | `passenger` and `operator`        |

> `applicableTo` on the badge table is typed as `"passenger" | "operator"`. Since
> all mapping badges apply to both actors, two badge rows SHOULD be inserted per
> badge (one per actor), or the column type should be extended to allow
> `"both"`. The implementation plan MUST resolve this before migration.

---

## Migration Notes

- All new tables are additive — existing migrations are unaffected.
- `PointsSourceAction` is a TypeScript discriminated union, not a Postgres enum,
  so adding new values is a non-breaking code change with no migration required.
- `map_contributor_stats` gains two new nullable columns (`map_streak`,
  `map_streak_checkpoint`); these default to 0 / NULL for existing rows.
- Run `npm run db-push` (workspace root) after adding `pkg/db/schema/map.ts` to
  `pkg/db/schema/index.ts`.
- Seed badge rows in the same migration/push step via a dedicated seed script in
  `pkg/db/`.
- `map_zone` rows MUST be seeded before any `map_feature` can be zone-linked.
  Zone seeding is a prerequisite task in the implementation plan for FR-024.
- `map_road_trace.trace_geo_json` MUST NOT be exposed via any public or partner
  API. Treat the column as restricted-read in all query builders.
