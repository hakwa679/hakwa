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

### Safety, Moderation & Trust

- [ ] **FR-028** — Content screener runs synchronously before any DB write on `POST /map/features`
- [ ] **FR-028** — Screener outcome `pass` → `status = "pending"`, points awarded normally
- [ ] **FR-028** — Screener outcome `flag` → `status = "pending_review"`, no `pointsLedger` entry, moderator alert enqueued
- [ ] **FR-028** — Screener outcome `auto_reject` → `422 MAP_CONTENT_VIOLATION`, no rows created
- [ ] **FR-028** — Blocklist loaded from `@hakwa/core/map-blocklist.json` at server startup; no per-request DB reads
- [ ] **FR-029** — Points for `pending_review` feature withheld until admin approves
- [ ] **FR-029** — Admin `approve` on `pending_review` atomically creates `pointsLedger` + transitions status
- [ ] **FR-030** — `POST /map/features/:id/report` accepts `reason` + optional `note`; unique on `(featureId, reporterId)`
- [ ] **FR-030** — Reporting own feature returns `403 MAP_CANNOT_REPORT_OWN`
- [ ] **FR-030** — Reporting feature not in `pending`/`active` returns `409 MAP_VOTING_CLOSED`
- [ ] **FR-031** — Third unique report triggers atomic `under_review` transition (row-level lock on `mapFeature`)
- [ ] **FR-031** — `under_review` feature removed from all map layers (pending and active)
- [ ] **FR-031** — Contributor push notification sent: "A feature you submitted is under review"
- [ ] **FR-032** — `GET /admin/map/moderation/queue` returns `pending_review` + `under_review` features, paginated
- [ ] **FR-032** — `POST /admin/map/features/:id/moderate` accepts actions: `approve`, `reject`, `warn_contributor`, `ban_contributor`
- [ ] **FR-032** — Admin endpoints protected by role middleware (`admin` or `map_moderator`); `403` for all others
- [ ] **FR-033** — Every moderation action creates an append-only `mapModerationLog` row
- [ ] **FR-033** — `mapModerationLog` rows are insert-only; never updated or deleted
- [ ] **FR-034** — `approve` on `under_review` sends contributor notification: "Feature restored"
- [ ] **FR-034** — `reject` sends contributor notification: "Feature removed after review"
- [ ] **FR-034** — No `pointsLedger` reversal on rejection of previously-awarded contributions
- [ ] **FR-035** — Trust tier computed dynamically: `standard` (default) / `trusted` (≥5 accepted) / `senior` (≥20 accepted)
- [ ] **FR-035** — Active ban (`isMapBanned = true`) always returns tier `standard` regardless of contribution count
- [ ] **FR-035** — `trustTier` field included in `GET /map/stats/me` response
- [ ] **FR-036** — `disputeCategory` field accepted in `POST /map/features/:id/verify` body
- [ ] **FR-036** — Trusted/Senior contributor dispute with `harmful_content` or `dangerous_info` triggers immediate `under_review`
- [ ] **FR-036** — Escalated dispute does not alter verification points awarded to the voter
- [ ] **FR-037** — GPS velocity heuristic runs on every `POST /map/features` request
- [ ] **FR-037** — Velocity > `MAP_GPS_MAX_VELOCITY_KM_H` (250 km/h) → `status = "pending_review"`, `gpsVelocityFlag = true`
- [ ] **FR-037** — Velocity check shares the pre-insert SELECT with the daily-rate-limit check (no extra round-trip)
- [ ] **FR-038** — Every `POST /map/features` and `POST /map/features/:id/verify` checks `isMapBanned` first
- [ ] **FR-038** — `isMapBanned = true` returns `403 MAP_USER_MAP_BANNED` immediately
- [ ] **FR-038** — Expired `banExpiresAt` auto-lifts the ban inline before the request proceeds
- [ ] **FR-039** — Nightly `map-abuse-check` job identifies voting-ring candidate pairs (> 80% mutual confirm rate)
- [ ] **FR-039** — Flagged pairs upserted into `mapAbuseFlag` with `flagType = "voting_ring"`
- [ ] **FR-039** — Job is read-only with respect to votes and bans; no automatic bans

---

## Non-Functional Requirements

- [ ] **NFR-001** — Bounding-box query responds < 500 ms for 10 km × 10 km box with 1 000 pending features (spatial index required)
- [ ] **NFR-002** — Active features GeoJSON endpoint served from Redis cache (TTL 60 s)
- [ ] **NFR-003** — Vote operations hold row-level lock on `mapFeature` for the transaction duration
- [ ] **NFR-004** — Rate limiting: 20 contributions/day and 200 verifications/day per user
- [ ] **NFR-005** — Photo uploads handled via presigned URL pre-upload; contribution endpoint receives URL only
- [ ] **NFR-006** — Badge evaluation and leaderboard updates execute asynchronously after primary transaction
- [ ] **NFR-007** — Content screener adds ≤ 50 ms to P99 latency; blocklist in-memory at server startup
- [ ] **NFR-008** — Admin endpoints (`/api/v1/admin/map/...`) on a separate router with role middleware, independent of user-session auth

---

## Data Model Checklist

- [ ] `mapFeature` table created in `pkg/db/schema/map.ts` with all required columns
- [ ] `mapFeature.status` enum includes `pending_review` and `under_review` (FR-028, FR-031)
- [ ] `mapFeature.gps_velocity_flag` boolean column added (FR-037)
- [ ] `mapVerification` table created with unique constraint on `(featureId, userId)`
- [ ] `mapVerification.dispute_category` nullable column added (FR-036)
- [ ] `mapContributorStats` table created with per-user counters (including `mapStreak`, `mapStreakCheckpoint`, `rideImpactCount`)
- [ ] `mapZone` table created with `slug`, `displayName`, `geometry_json`, `targetFeatureCount`, `currentFeatureCount`
- [ ] `mapMission` table created with `weekStart`, `deadline`, `actionType`, `targetCount`, optional `zoneId`
- [ ] `mapMissionProgress` table created with UNIQUE on `(missionId, userId)`
- [ ] `mapRoadTrace` table created; `trace_geo_json` column marked restricted in query builders
- [ ] `mapFeatureReport` table created with UNIQUE on `(featureId, reporterId)` (FR-030)
- [ ] `mapContributorTrust` table created with UNIQUE on `userId`; `banExpiresAt` nullable (FR-038)
- [ ] `mapModerationLog` table created; `featureId` nullable FK with SET NULL on delete (FR-033)
- [ ] `mapAbuseFlag` table created with UNIQUE on `(userId, flagType)` (FR-039)
- [ ] `PointsSourceAction` union type extended with all 7 new values (`map_contribution`, `map_verification`, `map_contribution_accepted`, `map_photo_bonus`, `map_road_trace`, `map_mission_completed`, `map_pioneer_bonus`)
- [ ] All map constants defined as named exports in `@hakwa/core` (20 constants — 15 original + 5 safety constants)
- [ ] Safety constants defined: `MAP_REPORT_AUTO_REVIEW_THRESHOLD`, `MAP_TRUST_MIN_ACCEPTED_TRUSTED`, `MAP_TRUST_MIN_ACCEPTED_SENIOR`, `MAP_GPS_MAX_VELOCITY_KM_H`, `MAP_VOTING_RING_MUTUAL_THRESHOLD`
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
- [ ] `POST /map/features/:id/verify` — cast confirm/dispute vote (includes `disputeCategory`)
- [ ] `POST /map/features/:id/report` — report a `pending` or `active` feature (FR-030)
- [ ] `GET /map/leaderboard` — monthly map leaderboard (top 50 + caller rank)
- [ ] `GET /map/stats/me` — caller stats including `mapStreak`, `rideImpactCount`, `trustTier`, `isMapBanned`
- [ ] `GET /map/missions` — current week missions with caller progress
- [ ] `GET /map/zones` — all zones with completion % and optional top contributors
- [ ] `GET /map/zones/:slug` — single zone detail with pioneer and top 3
- [ ] `POST /map/trace` — submit passive road trace (drivers only)
- [ ] `GET /admin/map/moderation/queue` — features in `pending_review`/`under_review`; role-protected (FR-032)
- [ ] `POST /admin/map/features/:id/moderate` — approve/reject/warn/ban; logs to `mapModerationLog` (FR-032, FR-033)
- [ ] `GET /admin/map/abuse/flags` — nightly abuse flag results; role-protected (FR-039)
- [ ] All public endpoints authenticated via `getSessionFromRequest`
- [ ] All admin endpoints protected by a separate role-validation middleware (NFR-008)
- [ ] All endpoints have application-layer rate limiting configured
- [ ] All error codes defined in `@hakwa/errors`: `MAP_OUT_OF_BOUNDS`, `MAP_DAILY_LIMIT_REACHED`, `MAP_ALREADY_VOTED`, `MAP_VOTING_CLOSED`, `MAP_PHOTO_TOO_LARGE`, `MAP_TRACE_OPT_IN_REQUIRED`, `MAP_CONTENT_VIOLATION`, `MAP_USER_MAP_BANNED`, `MAP_ALREADY_REPORTED`, `MAP_CANNOT_REPORT_OWN`

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
- [ ] Nightly `map-abuse-check` job in `api/src/jobs/mapAbuseCheck.ts` — identifies voting-ring pairs (FR-039)
- [ ] Abuse-check job upserts into `mapAbuseFlag` (`ON CONFLICT (userId, flagType) DO UPDATE`) — no new rows on repeat
- [ ] Content screener function `mapSafety.ts` in `@hakwa/core` — loaded at server startup (NFR-007)
- [ ] `map-blocklist.json` config file in `api/src/config/` — version-controlled, updated via PR

---

## Compliance & Licensing

- [ ] ODbL attribution documented in the app's About / Legal screen
- [ ] One-time contributor consent screen shown on first map contribution (see Open Question 5)
- [ ] OSM attribution rendered on all map views (existing `@hakwa/map` requirement, reconfirmed)
