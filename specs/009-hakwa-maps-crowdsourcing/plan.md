# Implementation Plan: Hakwa Maps — Crowdsourced Data Collection

**Feature**: 009-hakwa-maps-crowdsourcing  
**Spec**: [spec.md](spec.md)  
**Data Model**: [data-model.md](data-model.md)  
**Last updated**: 2026-03-16

---

## Architecture Notes

### Package placement

| Concern                             | Package                              |
| ----------------------------------- | ------------------------------------ |
| DB schema & Drizzle types           | `@hakwa/db` (`pkg/db/schema/map.ts`) |
| Constants (thresholds, limits)      | `@hakwa/core`                        |
| Coordinate & GeoJSON validation     | `@hakwa/core`                        |
| Map contribution REST routes        | `api/src/routes/map.ts`              |
| Badge evaluation (map actions)      | Extended worker in `@hakwa/workers`  |
| Redis leaderboard helpers           | `@hakwa/redis`                       |
| Offline contribution queue (mobile) | `@hakwa/api-client`                  |
| `<ContributionSheet />` UI          | `@hakwa/ui-native`                   |
| `<VerificationCard />` UI           | `@hakwa/ui-native`                   |
| Community Map mode (web)            | `@hakwa/ui-web`                      |

### Real-time delivery

When a feature transitions to `active`, a Redis pub/sub message is published to
`map:features:activated`, consumed by the WebSocket server, and broadcast to all
clients subscribed to the affected bounding box. Clients update their map layer
immediately — no polling required, consistent with Principle V.

### Offline queue (mobile)

The `@hakwa/api-client` package adds a `mapContributionQueue` backed by
`AsyncStorage` (Expo). Pending-submit contributions are stored locally with a
`queued` flag. On connectivity restoration (NetInfo event), the queue is drained
sequentially. Queued contributions carry device-recorded GPS coordinates and
timestamp; the server records both the device timestamp and the server-receipt
timestamp for auditing. Points are only awarded after server-side validation
succeeds.

### Mission scheduler

A weekly cron job running Monday UTC midnight creates three `mapMission` rows.
Mission templates (action type, target count, optional zone scope) are seeded as
a JSON config in `api/src/jobs/`. The scheduler picks three templates per week —
optionally weighting toward under-mapped zones or low-count feature types.
`mapMissionProgress` rows are created lazily on first user interaction, not
bulk-inserted for all users, to avoid O(users) write storms on Monday.

### Zone progress and pioneer detection

Zone membership is determined by a point-in-polygon check against `mapZone`
GeoJSON polygons run inside `api/src/services/mapZone.ts`. This runs
synchronously inside the feature-activation service function, just after the
`mapFeature` status update commits.

Zone counter updates use an atomic
`UPDATE map_zone SET current_feature_count = current_feature_count + 1 WHERE id = $id RETURNING current_feature_count`.
No row-level lock is needed because the increment is commutative. The pioneer
bonus is conditionally awarded only when `RETURNING current_feature_count = 1`.

Zone completion percentage is written to Redis
(`HSET map:zone:{id} pct {value} featureCount {n}`) after each increment.
Threshold notifications (50%, 100%) are triggered by comparing the pre- and
post-increment percentage bands within the same service call.

### Passive road-trace worker

The road-trace worker in `@hakwa/workers` receives the driver's trip GPS trace
as a GeoJSON LineString after the trip completes. It simplifies the line using
the Ramer–Douglas–Peucker algorithm, then checks each 50 m segment against the
active `mapFeature` layer (bbox + distance query) for novelty. Novel km is
floored to an integer and the result persisted in `mapRoadTrace`. The raw
coordinate array MUST NOT be sent to any external analytics service.

### ODbL upstream pipeline (future)

All `mapFeature` rows with `status = "active"` and `osmLicence = "ODbL"` are
candidates for OSM upstream contribution via the OSM Changeset API. A separate,
out-of-scope tooling job (not part of this feature) will periodically export
accepted features as OSM XML changesets. The `osmRef` column links corrections
back to existing OSM elements. This feature MUST NOT attempt to push data to OSM
automatically — that process requires human review.

### Safety and content moderation

**Content screener** — a pure function in `@hakwa/core/mapSafety.ts` that
accepts `{ name, description }` and returns `"pass" | "flag" | "auto_reject"`.
It matches against a compiled `Set<string>` (exact-match words) and `RegExp[]`
(pattern-match phrases) loaded from `api/src/config/map-blocklist.json` at
server startup. The blocklist is updated via PR; hot-reload is not required. The
screener executes inside the `POST /map/features` handler before the DB
transaction opens, adding at most ~1 ms to request processing.

**GPS velocity check** — The submitter's most recent `mapFeature.createdAt` and
`geometryJson` centroid are fetched in the same pre-insert SELECT that already
checks the daily rate limit. The haversine distance between the two coordinate
pairs is divided by the elapsed minutes to produce km/h. If this exceeds
`MAP_GPS_MAX_VELOCITY_KM_H` (250), the feature is inserted with
`status = "pending_review"` and `gpsVelocityFlag = true`. No extra round-trip is
required.

**Moderator queue** — the `mapFeature` table serves as its own queue. The admin
list endpoint is a simple paginated query:
`WHERE status IN ('pending_review', 'under_review') ORDER BY created_at ASC`. No
separate queue infrastructure (Redis queues, SQS, etc.) is needed. The
`mapModerationLog` table provides the audit trail required for compliance.

**Voting-ring detection** — the nightly `map-abuse-check` job runs a single
aggregation query over `mapVerification` and `mapFeature` joined to find mutual
confirmation pairs within the past 30 days. Pairs exceeding
`MAP_VOTING_RING_MUTUAL_THRESHOLD` on both sides are upserted into
`mapAbuseFlag`. The job is deliberately read-only with respect to votes and
bans; it only writes to the flag table. All enforcement decisions belong to
human moderators.

**Trust tier** — computed inline on every relevant request by reading
`mapContributorStats.acceptedContributions` and `mapContributorTrust` (if the
row exists). Because the tier is derived, it can never be stale. A missing
`mapContributorTrust` row is treated as `{ isMapBanned: false }`.

---

## Open Questions

1. **Photo storage**: Where are contributor photos stored? (S3 / Cloudflare R2 /
   local filesystem?) The implementation plan should decide and add the
   presigned URL endpoint.
2. **PostGIS vs TEXT-GeoJSON**: Does the current Postgres instance have PostGIS
   enabled? If not, spatial queries run on parsed GeoJSON TEXT with application-
   layer filtering — acceptable for Fiji's data volumes but a PostGIS migration
   should be prioritised.
3. **Leaderboard scope**: Is one national leaderboard sufficient for Phase 1, or
   do we need per-island (Viti Levu / Vanua Levu) leaderboards immediately?
4. ~~**Moderation escalation**: Should heavily disputed features (e.g.,
   `disputeCount ≥ 5` without resolution) be escalated to a Hakwa admin review
   queue, or is automatic rejection sufficient for Phase 1?~~ **Resolved by
   FR-031–FR-039 and User Story 11**: a full three-layer safety system (content
   screening, community reporting, and admin moderation queue) is included in
   this feature. The `mapFeature` table itself serves as the moderation queue;
   no separate infrastructure is required.
5. **OSM contributor agreement**: Contributors should ideally confirm they agree
   to release their submissions under ODbL. Should this be a one-time in-app
   consent screen on first contribution, or is the platform's Terms of Service
   sufficient?
6. **Zone boundary definitions**: Who defines and maintains the GeoJSON polygons
   for `mapZone`? Options: (a) manually authored polygons, (b) imported from
   Fiji Bureau of Statistics administrative-boundary shapefiles, or (c) derived
   algorithmically from the OSM Fiji extract. An admin seeding interface or a
   one-time seeding script must be specified before FR-024 is implemented.
7. **Road-trace privacy consent**: Passive tracing records GPS coordinates while
   drivers are working. Does the opt-in toggle in settings constitute sufficient
   consent under Fiji's data protection framework, or is a more explicit
   disclosure required? Legal review recommended before FR-022 ships.
8. **Mission content pipeline**: Who authors the weekly mission templates — a
   hardcoded rotation, an admin UI, or an algorithmic selection based on which
   zones or feature types are most sparse? This must be decided before the
   mission scheduler job is built.
