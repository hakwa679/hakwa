# Requirements Checklist: Hakwa Maps — Crowdsourced Data Collection

**Feature**: 009-hakwa-maps-crowdsourcing  
**Last updated**: 2026-03-16

---

## Functional Requirements

### Core Contribution Flow

- [ ] **FR-001** — Authenticated passengers and operators can submit map features
- [ ] **FR-002** — Submissions outside Fiji bounding box or with GPS accuracy > 50 m are rejected
- [ ] **FR-003** — `MAP_DAILY_CONTRIBUTION_LIMIT` (20) enforced per user per UTC day
- [ ] **FR-016** — Coordinates of (0, 0) or NaN are rejected at the API boundary
- [ ] **FR-017** — Proximity warning shown when a same-type feature exists within 10 m

### Verification Flow

- [ ] **FR-004** — Authenticated users can cast exactly one vote per feature (except own contributions)
- [ ] **FR-005** — Feature transitions to `active` when `confirmCount >= 3` and `disputeCount < 3` (atomic)
- [ ] **FR-006** — Feature transitions to `rejected` when `disputeCount >= 3` and `confirmCount < 3`

### Gamification Integration

- [ ] **FR-007** — `map_contribution` awards `MAP_POINTS_CONTRIBUTION` (25 pts) via `pointsLedger`
- [ ] **FR-008** — `map_verification` awards `MAP_POINTS_VERIFICATION` (5 pts) via `pointsLedger`
- [ ] **FR-009** — `map_contribution_accepted` awards `MAP_POINTS_ACCEPTED` (50 pts) on feature activation
- [ ] **FR-010** — Map `pointsLedger` entries trigger existing badge-evaluation worker

### Map Data Access

- [ ] **FR-011** — Pending features queryable by bounding box, type, and age (paginated, 20/page)
- [ ] **FR-012** — Active features returned as GeoJSON `FeatureCollection` for `@hakwa/map` layer
- [ ] **FR-013** — Redis sorted set `map:leaderboard:monthly:{YYYY-MM}` incremented atomically on every map `pointsLedger` write
- [ ] **FR-014** — Nightly job transitions `pending` features > 60 days with < 2 votes to `stale`
- [ ] **FR-015** — `mapFeature` geometry stored with coordinate precision limited to 6 decimal places
- [ ] **FR-018** — All accepted `mapFeature` records carry `osmLicence = "ODbL"`

### Offline & Connectivity

- [ ] **FR-020** — Mobile apps queue contributions offline; submission sent on reconnect; points awarded only after server validation

### Frontend Integration

- [ ] **FR-019** — _"Explore & Map Fiji"_ entry point in Rider App, Driver App, and Rider Web Portal (not _"Contribute to Hakwa Maps"_)

### Photo Bonus

- [ ] **FR-021** — Contributions with `photoUrl` award extra `MAP_POINTS_PHOTO_BONUS` (10 pts) via separate `pointsLedger` entry of type `map_photo_bonus`

### Passive Road Tracing (Drivers)

- [ ] **FR-022** — Driver settings include opt-in/out toggle for passive road tracing
- [ ] **FR-022** — Driver opt-in status checked before any GPS trace is stored or processed
- [ ] **FR-022** — Road-trace worker task in `@hakwa/workers` receives GeoJSON LineString post-trip
- [ ] **FR-022** — Worker detects novel road km (> `MAP_ROAD_NOVEL_THRESHOLD_M` = 20 m from active features)
- [ ] **FR-022** — Novel km floored to integer; `pointsLedger` entry of type `map_road_trace` created
- [ ] **FR-022** — Daily cap `MAP_ROAD_TRACE_DAILY_CAP_PTS` (50 pts) enforced per driver per UTC day
- [ ] **FR-022** — Raw trace coordinates MUST NOT be exposed in any API response
- [ ] **FR-022** — `POST /map/trace` endpoint (driver-only, `403` for passengers)

### Weekly Missions

- [ ] **FR-023** — Scheduled job creates `MAP_MISSIONS_PER_WEEK` (3) `mapMission` rows every Monday UTC midnight
- [ ] **FR-023** — Each mission has `actionType`, `targetCount`, optional `zoneId`, and `deadline` (Sunday 23:59:59 UTC)
- [ ] **FR-023** — `mapMissionProgress` rows created lazily on first qualifying user action
- [ ] **FR-023** — Progress incremented correctly per `actionType` (contribute_poi, verify_features, etc.)
- [ ] **FR-023** — All 3 missions `completed` → `pointsLedger` entry of type `map_mission_completed` (100 pts)
- [ ] **FR-023** — Expired missions receive `status = "expired"`; no retroactive bonus
- [ ] **FR-023** — `GET /map/missions` returns current week missions with caller progress

### Neighbourhood Progress

- [ ] **FR-024** — `mapZone` table seeded with named Fiji zones (see Open Question 6)
- [ ] **FR-024** — Point-in-polygon check against `mapZone` runs on each `mapFeature` activation
- [ ] **FR-024** — `currentFeatureCount` incremented atomically with `UPDATE ... RETURNING`
- [ ] **FR-024** — Zone completion % cached in Redis `map:zone:{id}:pct`
- [ ] **FR-024** — Broadcast push notification sent to contributors when zone crosses 50%
- [ ] **FR-024** — Broadcast push notification + `map_zone_complete` badge awarded at 100%
- [ ] **FR-024** — `GET /map/zones` returns all zones with pct, counts, and optional top contributors
- [ ] **FR-024** — `GET /map/zones/:slug` returns single zone detail with pioneer and top 3

### First Discoverer Bonus

- [ ] **FR-025** — Pioneer bonus triggered only when `RETURNING current_feature_count = 1`
- [ ] **FR-025** — `pointsLedger` entry of type `map_pioneer_bonus` (75 pts) awarded once per zone
- [ ] **FR-025** — `map_pioneer` badge triggered after pioneer bonus (badge-evaluation worker)
- [ ] **FR-025** — `map_explorer` badge triggered when user has pioneered ≥ 3 zones
- [ ] **FR-025** — Race condition handled: only first activation per zone gets the bonus

### Impact Counter

- [ ] **FR-026** — `rideImpactCount` field included in `GET /map/stats/me` response
- [ ] **FR-026** — Count is computed as completed trips within 100 m of user's active contributions

### Map Streak

- [ ] **FR-027** — `mapStreak` and `mapStreakCheckpoint` columns on `mapContributorStats`
- [ ] **FR-027** — Streak increments on any map action (contribution or verification) per UTC day
- [ ] **FR-027** — 7-day streak awards `MAP_POINTS_MAP_STREAK_7` (35 pts) via `streak_bonus` ledger entry

---

## Non-Functional Requirements

- [ ] **NFR-001** — Bounding-box query responds < 500 ms for 10 km × 10 km box with 1 000 pending features (spatial index required)
- [ ] **NFR-002** — Active features GeoJSON endpoint served from Redis cache (TTL 60 s)
- [ ] **NFR-003** — Vote operations hold row-level lock on `mapFeature` for the transaction duration
- [ ] **NFR-004** — Rate limiting: 20 contributions/day and 200 verifications/day per user
- [ ] **NFR-005** — Photo uploads handled via presigned URL pre-upload; contribution endpoint receives URL only
- [ ] **NFR-006** — Badge evaluation and leaderboard updates execute asynchronously after primary transaction

---

## Data Model Checklist

- [ ] `mapFeature` table created in `pkg/db/schema/map.ts` with all required columns
- [ ] `mapVerification` table created with unique constraint on `(featureId, userId)`
- [ ] `mapContributorStats` table created with per-user counters (including `mapStreak`, `mapStreakCheckpoint`)
- [ ] `mapZone` table created with `slug`, `displayName`, `geometry_json`, `targetFeatureCount`, `currentFeatureCount`
- [ ] `mapMission` table created with `weekStart`, `deadline`, `actionType`, `targetCount`, optional `zoneId`
- [ ] `mapMissionProgress` table created with UNIQUE on `(missionId, userId)`
- [ ] `mapRoadTrace` table created; `trace_geo_json` column marked restricted in query builders
- [ ] `PointsSourceAction` union type extended with all 7 new values (`map_contribution`, `map_verification`, `map_contribution_accepted`, `map_photo_bonus`, `map_road_trace`, `map_mission_completed`, `map_pioneer_bonus`)
- [ ] All map constants defined as named exports in `@hakwa/core` (15 constants, no magic numbers)
- [ ] Spatial / B-tree index on `mapFeature.status` and `mapFeature.geometryJson`
- [ ] All new schema files exported through `@hakwa/db` index

---

## Badge Seed Data Checklist

- [ ] `map_first_contribution` — First Mapper badge seeded
- [ ] `map_10_accepted` — Road Builder badge seeded
- [ ] `map_50_accepted` — Local Expert badge seeded
- [ ] `map_25_verifications` — Community Checker badge seeded
- [ ] `map_100_verifications` — Community Guardian badge seeded
- [ ] `map_cartographer` — Cartographer badge seeded
- [ ] `map_photo_10` — Picture Perfect badge seeded
- [ ] `map_pioneer` — First Explorer badge seeded
- [ ] `map_explorer` — Zone Explorer badge seeded
- [ ] `map_zone_complete` — Zone Champion badge seeded
- [ ] `map_mission_4_streak` — Mission Veteran badge seeded
- [ ] Badge criteria documented in the badge-evaluation worker

---

## API Checklist

- [ ] `POST /map/features` — submit contribution
- [ ] `GET /map/features/pending` — list pending features (bbox, type, age filters)
- [ ] `GET /map/features/active` — GeoJSON FeatureCollection of active features
- [ ] `POST /map/features/:id/verify` — cast confirm/dispute vote
- [ ] `GET /map/leaderboard` — monthly map leaderboard (top 50 + caller rank)
- [ ] `GET /map/stats/me` — caller stats including `mapStreak` and `rideImpactCount`
- [ ] `GET /map/missions` — current week missions with caller progress
- [ ] `GET /map/zones` — all zones with completion % and optional top contributors
- [ ] `GET /map/zones/:slug` — single zone detail with pioneer and top 3
- [ ] `POST /map/trace` — submit passive road trace (drivers only)
- [ ] All endpoints authenticated via `getSessionFromRequest`
- [ ] All endpoints have application-layer rate limiting configured
- [ ] `MAP_OUT_OF_BOUNDS`, `MAP_DAILY_LIMIT_REACHED`, `MAP_ALREADY_VOTED`, `MAP_VOTING_CLOSED`, `MAP_PHOTO_TOO_LARGE`, `MAP_TRACE_OPT_IN_REQUIRED` error codes defined in `@hakwa/errors`

---

## Real-Time Checklist

- [ ] `map:features:activated` Redis channel published when a feature goes active
- [ ] WebSocket server subscribes and broadcasts feature-activated events to bounding-box subscribers
- [ ] `map:leaderboard:monthly:{YYYY-MM}` Redis sorted set incremented on every map-points ledger write

---

## Mobile Checklist

- [ ] `mapContributionQueue` persistent queue in `@hakwa/api-client` using `AsyncStorage`
- [ ] NetInfo connectivity listener drains queue on reconnect
- [ ] Queued submissions include device-recorded GPS coordinates and device timestamp
- [ ] Server records both device timestamp and server-receipt timestamp
- [ ] `<ContributionSheet />` component in `@hakwa/ui-native`
- [ ] `<VerificationCard />` component in `@hakwa/ui-native`
- [ ] `<MissionCard />` component in `@hakwa/ui-native` and `@hakwa/ui-web`
- [ ] `<ZoneProgressLayer />` map overlay in `@hakwa/map`
- [ ] Driver opt-in toggle for passive road tracing in DriverApp settings screen

---

## Workers & Scheduled Jobs Checklist

- [ ] Mission scheduler job in `api/src/jobs/mapMissions.ts` runs Monday UTC midnight
- [ ] Mission expiry job runs Sunday 23:59:59 UTC
- [ ] Road-trace worker in `@hakwa/workers` wired to trip-completed event
- [ ] Zone progress service in `api/src/services/mapZone.ts` wired to feature-activated event
- [ ] Zone milestone threshold detection and notification dispatch (50% and 100%)
- [ ] Pioneer bonus evaluated inside zone progress service (RETURNING = 1 check)

---

## Compliance & Licensing

- [ ] ODbL attribution documented in the app's About / Legal screen
- [ ] One-time contributor consent screen shown on first map contribution (see Open Question 5)
- [ ] OSM attribution rendered on all map views (existing `@hakwa/map` requirement, reconfirmed)
