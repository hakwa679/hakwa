# Research: Hakwa Maps — Crowdsourced Data Collection

## Decision: GeoJSON vs PostGIS for Geometry Storage

**Decision**: Store geometry as a GeoJSON string in `geometry_json TEXT` column
(NOT a PostGIS `geometry` type). Validation and coordinate simplification run in
the API layer using `@hakwa/core` utilities.

**Rationale**: PostGIS adds a complex extension dependency requiring a
PostGIS-enabled PostgreSQL image. For Phase 1 scale (thousands of
contributions), GeoJSON string storage with application-layer bounding-box
filtering is sufficient. The query uses a JSONB extraction or coordinates-column
approach for spatial queries. Switching to PostGIS is a Phase 2 migration.

**Alternatives considered**:

- PostGIS `geometry` column: Better spatial indexing (GiST); required for
  complex spatial queries at scale. Not worth the infra complexity for Phase 1.
- JSONB column: Would allow `->` operator queries but still lacks spatial
  indexing. GeoJSON string is simpler and adequate.

---

## Decision: Offline Queue Storage

**Decision**: The `@hakwa/api-client` package implements a
`mapContributionQueue` backed by Expo `AsyncStorage`. Pending contributions are
stored locally with a `queued` flag. On connectivity restoration (React Native
NetInfo `isConnected` event), the queue drains sequentially. Points are awarded
only after server-side validation succeeds — never offline.

**Rationale**: Aligns with constitution principle XVI (offline banner + cached
data). React Native `AsyncStorage` is the standard persistent queue for Expo
apps. Sequential drain avoids flooding the API on reconnect.

**Alternatives considered**:

- SQLite offline store: Heavier dependency; overkill for a queue of
  contributions.
- No offline queue: Poor UX in areas with spotty coverage (which is typical in
  Fiji's outer islands).

---

## Decision: Content Screening

**Decision**: GPS velocity heuristic runs server-side on submit. If the
submitting device's last known location (from `driver:{userId}:loc` Redis hash
or submission coordinates) implies movement > 60 km/h, `gpsVelocityFlag = true`
and status is set to `pending_review` instead of `pending`. A seeded daily-cap
constant (`MAX_CONTRIBUTIONS_PER_DAY_PER_USER = 50`) prevents spam.

Photo content screening: Phase 1 = manual admin queue only. Automated image
moderation (e.g., Cloud Vision, NSFW classifier) deferred to Phase 2.

**Rationale**: Velocity check is O(1) at submit time with no external API call.
Admin manual review queue is pragmatic for Phase 1 volumes.

---

## Decision: Ramer-Douglas-Peucker Simplification

**Decision**: Road trace LineString coordinates are simplified server-side using
the Ramer-Douglas-Peucker (RDP) algorithm before storing `geometry_json`.
Tolerance = 0.00001 degrees (~1 metre). Implementation lives in
`@hakwa/core/src/geometry/rdp.ts`.

**Rationale**: Driver-recorded GPS traces can have hundreds of points per
kilometre. RDP reduces storage and query payload without perceptible accuracy
loss at the zoom levels used in the map UI.

---

## Decision: ODbL Licence Tagging

**Decision**: Every `mapFeature` row has `osm_licence = 'ODbL'` (default). When
a contribution is exported to the upstream OSM contribution pipeline (Phase 2),
the licence tag is included. For Phase 1, the field is stored but no upload
pipeline exists.

**Rationale**: Proactively tagging contributions with the Open Database Licence
avoids a future migration. ODbL is the licence used by OpenStreetMap.

---

## Decision: Trust Tier Computation

**Decision**: Trust tiers (`new_contributor | trusted | verified`) are derived
from `pointsAccount.totalPoints` at query time using threshold constants:

- `TRUST_TIER_TRUSTED_MIN_POINTS = 200`
- `TRUST_TIER_VERIFIED_MIN_POINTS = 1000`

Trust tier is NOT stored; it is derived on read. Used to weight confirm/dispute
votes: trusted = 1.5×, verified = 2×; new_contributor = 1×. Auto-activation
threshold:
`confirm_count >= FEATURE_AUTO_ACTIVATE_CONFIRM_THRESHOLD * effectiveVotes`.

**Rationale**: Consistent with the level computation pattern from spec 007 —
derived fields avoid stale data when thresholds are updated.

---

## Decision: Mission Scheduler

**Decision**: Weekly cron job runs every Monday at 00:01 UTC, creating 3
`mapMission` rows from JSON templates in `api/src/jobs/missionTemplates.ts`.
`mapMissionProgress` rows are created lazily (on first user action), not
bulk-pre-created, to avoid O(users) write storms.

**Rationale**: Lazy creation is O(1) per interaction vs O(users) on Monday
morning. Matches the constitution's scale constraint.
