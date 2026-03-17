# Requirements Checklist: Hakwa Maps — Crowdsourced Data Collection

**Feature**: 009-hakwa-maps-crowdsourcing  
**Last updated**: 2026-03-16

---

## Functional Requirements

### Core Contribution Flow

- [x] **FR-001** — Authenticated passengers and operators can submit map
      features
- [x] **FR-002** — Submissions outside Fiji bounding box or with GPS accuracy >
      50 m are rejected
- [x] **FR-003** — `MAP_DAILY_CONTRIBUTION_LIMIT` (20) enforced per user per UTC
      day
- [x] **FR-016** — Coordinates of (0, 0) or NaN are rejected at the API boundary
- [x] **FR-017** — Proximity warning shown when a same-type feature exists
      within 10 m

### Verification Flow

- [x] **FR-004** — Authenticated users can cast exactly one vote per feature
      (except own contributions)
- [x] **FR-005** — Feature transitions to `active` when `confirmCount >= 3` and
      `disputeCount < 3` (atomic)
- [x] **FR-006** — Feature transitions to `rejected` when `disputeCount >= 3`
      and `confirmCount < 3`

### Gamification Integration

- [x] **FR-007** — `map_contribution` awards `MAP_POINTS_CONTRIBUTION` (25 pts)
      via `pointsLedger`
- [x] **FR-008** — `map_verification` awards `MAP_POINTS_VERIFICATION` (5 pts)
      via `pointsLedger`
- [x] **FR-009** — `map_contribution_accepted` awards `MAP_POINTS_ACCEPTED` (50
      pts) on feature activation
- [x] **FR-010** — Map `pointsLedger` entries trigger existing badge-evaluation
      worker

### Map Data Access

- [x] **FR-011** — Pending features queryable by bounding box, type, and age
      (paginated, 20/page)
- [x] **FR-012** — Active features returned as GeoJSON `FeatureCollection` for
      `@hakwa/map` layer
- [x] **FR-013** — Redis sorted set `map:leaderboard:monthly:{YYYY-MM}`
      incremented atomically on every map `pointsLedger` write
- [x] **FR-014** — Nightly job transitions `pending` features > 60 days with < 2
      votes to `stale`
- [x] **FR-015** — `mapFeature` geometry stored with coordinate precision
      limited to 6 decimal places
- [x] **FR-018** — All accepted `mapFeature` records carry `osmLicence = "ODbL"`

### Offline & Connectivity

- [x] **FR-020** — Mobile apps queue contributions offline; submission sent on
      reconnect; points awarded only after server validation

### Frontend Integration

- [x] **FR-019** — _"Explore & Map Fiji"_ entry point in Rider App, Driver App,
      and Rider Web Portal (not _"Contribute to Hakwa Maps"_)

### Photo Bonus

- [x] **FR-021** — Contributions with `photoUrl` award extra
      `MAP_POINTS_PHOTO_BONUS` (10 pts) via separate `pointsLedger` entry of
      type `map_photo_bonus`

### Passive Road Tracing (Drivers)

- [x] **FR-022** — Driver settings include opt-in/out toggle for passive road
      tracing
- [x] **FR-022** — Driver opt-in status checked before any GPS trace is stored
      or processed
- [x] **FR-022** — Road-trace worker task in `@hakwa/workers` receives GeoJSON
      LineString post-trip
- [x] **FR-022** — Worker detects novel road km (> `MAP_ROAD_NOVEL_THRESHOLD_M`
      = 20 m from active features)
- [x] **FR-022** — Novel km floored to integer; `pointsLedger` entry of type
      `map_road_trace` created
- [x] **FR-022** — Daily cap `MAP_ROAD_TRACE_DAILY_CAP_PTS` (50 pts) enforced
      per driver per UTC day
- [x] **FR-022** — Raw trace coordinates MUST NOT be exposed in any API response
- [x] **FR-022** — `POST /map/trace` endpoint (driver-only, `403` for
      passengers)

### Weekly Missions

- [x] **FR-023** — Scheduled job creates `MAP_MISSIONS_PER_WEEK` (3)
      `mapMission` rows every Monday UTC midnight
- [x] **FR-023** — Each mission has `actionType`, `targetCount`, optional
      `zoneId`, and `deadline` (Sunday 23:59:59 UTC)
- [x] **FR-023** — `mapMissionProgress` rows created lazily on first qualifying
      user action
- [x] **FR-023** — Progress incremented correctly per `actionType`
      (contribute_poi, verify_features, etc.)
- [x] **FR-023** — All 3 missions `completed` → `pointsLedger` entry of type
      `map_mission_completed` (100 pts)
- [x] **FR-023** — Expired missions receive `status = "expired"`; no retroactive
      bonus
- [x] **FR-023** — `GET /map/missions` returns current week missions with caller
      progress

### Neighbourhood Progress

- [x] **FR-024** — `mapZone` table seeded with named Fiji zones (see Open
      Question 6)
- [x] **FR-024** — Point-in-polygon check against `mapZone` runs on each
      `mapFeature` activation
- [x] **FR-024** — `currentFeatureCount` incremented atomically with
      `UPDATE ... RETURNING`
- [x] **FR-024** — Zone completion % cached in Redis `map:zone:{id}:pct`
- [x] **FR-024** — Broadcast push notification sent to contributors when zone
      crosses 50%
- [x] **FR-024** — Broadcast push notification + `map_zone_complete` badge
      awarded at 100%
- [x] **FR-024** — `GET /map/zones` returns all zones with pct, counts, and
      optional top contributors
- [x] **FR-024** — `GET /map/zones/:slug` returns single zone detail with
      pioneer and top 3

### First Discoverer Bonus

- [x] **FR-025** — Pioneer bonus triggered only when
      `RETURNING current_feature_count = 1`
- [x] **FR-025** — `pointsLedger` entry of type `map_pioneer_bonus` (75 pts)
      awarded once per zone
- [x] **FR-025** — `map_pioneer` badge triggered after pioneer bonus
      (badge-evaluation worker)
- [x] **FR-025** — `map_explorer` badge triggered when user has pioneered ≥ 3
      zones
- [x] **FR-025** — Race condition handled: only first activation per zone gets
      the bonus

### Impact Counter

- [x] **FR-026** — `rideImpactCount` field included in `GET /map/stats/me`
      response
- [x] **FR-026** — Count is computed as completed trips within 100 m of user's
      active contributions

### Map Streak

- [x] **FR-027** — `mapStreak` and `mapStreakCheckpoint` columns on
      `mapContributorStats`
- [x] **FR-027** — Streak increments on any map action (contribution or
      verification) per UTC day
- [x] **FR-027** — 7-day streak awards `MAP_POINTS_MAP_STREAK_7` (35 pts) via
      `streak_bonus` ledger entry

### Safety, Moderation & Trust

- [x] **FR-028** — Content screener runs synchronously before any DB write on
      `POST /map/features`
- [x] **FR-028** — Screener outcome `pass` → `status = "pending"`, points
      awarded normally
- [x] **FR-028** — Screener outcome `flag` → `status = "pending_review"`, no
      `pointsLedger` entry, moderator alert enqueued
- [x] **FR-028** — Screener outcome `auto_reject` → `422 MAP_CONTENT_VIOLATION`,
      no rows created
- [x] **FR-028** — Blocklist loaded from `@hakwa/core/map-blocklist.json` at
      server startup; no per-request DB reads
- [x] **FR-029** — Points for `pending_review` feature withheld until admin
      approves
- [x] **FR-029** — Admin `approve` on `pending_review` atomically creates
      `pointsLedger` + transitions status
- [x] **FR-030** — `POST /map/features/:id/report` accepts `reason` + optional
      `note`; unique on `(featureId, reporterId)`
- [x] **FR-030** — Reporting own feature returns `403 MAP_CANNOT_REPORT_OWN`
- [x] **FR-030** — Reporting feature not in `pending`/`active` returns
      `409 MAP_VOTING_CLOSED`
- [x] **FR-031** — Third unique report triggers atomic `under_review` transition
      (row-level lock on `mapFeature`)
- [x] **FR-031** — `under_review` feature removed from all map layers (pending
      and active)
- [x] **FR-031** — Contributor push notification sent: "A feature you submitted
      is under review"
- [x] **FR-032** — `GET /admin/map/moderation/queue` returns `pending_review` +
      `under_review` features, paginated
- [x] **FR-032** — `POST /admin/map/features/:id/moderate` accepts actions:
      `approve`, `reject`, `warn_contributor`, `ban_contributor`
- [x] **FR-032** — Admin endpoints protected by role middleware (`admin` or
      `map_moderator`); `403` for all others
- [x] **FR-033** — Every moderation action creates an append-only
      `mapModerationLog` row
- [x] **FR-033** — `mapModerationLog` rows are insert-only; never updated or
      deleted
- [x] **FR-034** — `approve` on `under_review` sends contributor notification:
      "Feature restored"
- [x] **FR-034** — `reject` sends contributor notification: "Feature removed
      after review"
- [x] **FR-034** — No `pointsLedger` reversal on rejection of previously-awarded
      contributions
- [x] **FR-035** — Trust tier computed dynamically: `standard` (default) /
      `trusted` (≥5 accepted) / `senior` (≥20 accepted)
- [x] **FR-035** — Active ban (`isMapBanned = true`) always returns tier
      `standard` regardless of contribution count
- [x] **FR-035** — `trustTier` field included in `GET /map/stats/me` response
- [x] **FR-036** — `disputeCategory` field accepted in
      `POST /map/features/:id/verify` body
- [x] **FR-036** — Trusted/Senior contributor dispute with `harmful_content` or
      `dangerous_info` triggers immediate `under_review`
- [x] **FR-036** — Escalated dispute does not alter verification points awarded
      to the voter
- [x] **FR-037** — GPS velocity heuristic runs on every `POST /map/features`
      request
- [x] **FR-037** — Velocity > `MAP_GPS_MAX_VELOCITY_KM_H` (250 km/h) →
      `status = "pending_review"`, `gpsVelocityFlag = true`
- [x] **FR-037** — Velocity check shares the pre-insert SELECT with the
      daily-rate-limit check (no extra round-trip)
- [x] **FR-038** — Every `POST /map/features` and
      `POST /map/features/:id/verify` checks `isMapBanned` first
- [x] **FR-038** — `isMapBanned = true` returns `403 MAP_USER_MAP_BANNED`
      immediately
- [x] **FR-038** — Expired `banExpiresAt` auto-lifts the ban inline before the
      request proceeds
- [x] **FR-039** — Nightly `map-abuse-check` job identifies voting-ring
      candidate pairs (> 80% mutual confirm rate)
- [x] **FR-039** — Flagged pairs upserted into `mapAbuseFlag` with
      `flagType = "voting_ring"`
- [x] **FR-039** — Job is read-only with respect to votes and bans; no automatic
      bans

---

## Non-Functional Requirements

- [x] **NFR-001** — Bounding-box query responds < 500 ms for 10 km × 10 km box
      with 1 000 pending features (spatial index required)
- [x] **NFR-002** — Active features GeoJSON endpoint served from Redis cache
      (TTL 60 s)
- [x] **NFR-003** — Vote operations hold row-level lock on `mapFeature` for the
      transaction duration
- [x] **NFR-004** — Rate limiting: 20 contributions/day and 200
      verifications/day per user
- [x] **NFR-005** — Photo uploads handled via presigned URL pre-upload;
      contribution endpoint receives URL only
- [x] **NFR-006** — Badge evaluation and leaderboard updates execute
      asynchronously after primary transaction
- [x] **NFR-007** — Content screener adds ≤ 50 ms to P99 latency; blocklist
      in-memory at server startup
- [x] **NFR-008** — Admin endpoints (`/api/v1/admin/map/...`) on a separate
      router with role middleware, independent of user-session auth

---

## Data Model Checklist

- [x] `mapFeature` table created in `pkg/db/schema/map.ts` with all required
      columns
- [x] `mapFeature.status` enum includes `pending_review` and `under_review`
      (FR-028, FR-031)
- [x] `mapFeature.gps_velocity_flag` boolean column added (FR-037)
- [x] `mapVerification` table created with unique constraint on
      `(featureId, userId)`
- [x] `mapVerification.dispute_category` nullable column added (FR-036)
- [x] `mapContributorStats` table created with per-user counters (including
      `mapStreak`, `mapStreakCheckpoint`, `rideImpactCount`)
- [x] `mapZone` table created with `slug`, `displayName`, `geometry_json`,
      `targetFeatureCount`, `currentFeatureCount`
- [x] `mapMission` table created with `weekStart`, `deadline`, `actionType`,
      `targetCount`, optional `zoneId`
- [x] `mapMissionProgress` table created with UNIQUE on `(missionId, userId)`
- [x] `mapRoadTrace` table created; `trace_geo_json` column marked restricted in
      query builders
- [x] `mapFeatureReport` table created with UNIQUE on `(featureId, reporterId)`
      (FR-030)
- [x] `mapContributorTrust` table created with UNIQUE on `userId`;
      `banExpiresAt` nullable (FR-038)
- [x] `mapModerationLog` table created; `featureId` nullable FK with SET NULL on
      delete (FR-033)
- [x] `mapAbuseFlag` table created with UNIQUE on `(userId, flagType)` (FR-039)
- [x] `PointsSourceAction` union type extended with all 7 new values
      (`map_contribution`, `map_verification`, `map_contribution_accepted`,
      `map_photo_bonus`, `map_road_trace`, `map_mission_completed`,
      `map_pioneer_bonus`)
- [x] All map constants defined as named exports in `@hakwa/core` (20 constants
      — 15 original + 5 safety constants)
- [x] Safety constants defined: `MAP_REPORT_AUTO_REVIEW_THRESHOLD`,
      `MAP_TRUST_MIN_ACCEPTED_TRUSTED`, `MAP_TRUST_MIN_ACCEPTED_SENIOR`,
      `MAP_GPS_MAX_VELOCITY_KM_H`, `MAP_VOTING_RING_MUTUAL_THRESHOLD`
- [x] Spatial / B-tree index on `mapFeature.status` and
      `mapFeature.geometryJson`
- [x] All new schema files exported through `@hakwa/db` index

---

## Badge Seed Data Checklist

- [x] `map_first_contribution` — First Mapper badge seeded
- [x] `map_10_accepted` — Road Builder badge seeded
- [x] `map_50_accepted` — Local Expert badge seeded
- [x] `map_25_verifications` — Community Checker badge seeded
- [x] `map_100_verifications` — Community Guardian badge seeded
- [x] `map_cartographer` — Cartographer badge seeded
- [x] `map_photo_10` — Picture Perfect badge seeded
- [x] `map_pioneer` — First Explorer badge seeded
- [x] `map_explorer` — Zone Explorer badge seeded
- [x] `map_zone_complete` — Zone Champion badge seeded
- [x] `map_mission_4_streak` — Mission Veteran badge seeded
- [x] Badge criteria documented in the badge-evaluation worker

---

## API Checklist

- [x] `POST /map/features` — submit contribution
- [x] `GET /map/features/pending` — list pending features (bbox, type, age
      filters)
- [x] `GET /map/features/active` — GeoJSON FeatureCollection of active features
- [x] `POST /map/features/:id/verify` — cast confirm/dispute vote (includes
      `disputeCategory`)
- [x] `POST /map/features/:id/report` — report a `pending` or `active` feature
      (FR-030)
- [x] `GET /map/leaderboard` — monthly map leaderboard (top 50 + caller rank)
- [x] `GET /map/stats/me` — caller stats including `mapStreak`,
      `rideImpactCount`, `trustTier`, `isMapBanned`

---

## Completion Status

- [x] Map crowdsourcing implementation phases (US1-US11) merged.
- [x] Remaining spec 009 task artifacts (tests, hooks, docs, runbooks) added.
- [x] Final checklist sweep completed for task-level closure.
- [x] `GET /map/missions` — current week missions with caller progress
- [x] `GET /map/zones` — all zones with completion % and optional top
      contributors
- [x] `GET /map/zones/:slug` — single zone detail with pioneer and top 3
- [x] `POST /map/trace` — submit passive road trace (drivers only)
- [x] `GET /admin/map/moderation/queue` — features in
      `pending_review`/`under_review`; role-protected (FR-032)
- [x] `POST /admin/map/features/:id/moderate` — approve/reject/warn/ban; logs to
      `mapModerationLog` (FR-032, FR-033)
- [x] `GET /admin/map/abuse/flags` — nightly abuse flag results; role-protected
      (FR-039)
- [x] All public endpoints authenticated via `getSessionFromRequest`
- [x] All admin endpoints protected by a separate role-validation middleware
      (NFR-008)
- [x] All endpoints have application-layer rate limiting configured
- [x] All error codes defined in `@hakwa/errors`: `MAP_OUT_OF_BOUNDS`,
      `MAP_DAILY_LIMIT_REACHED`, `MAP_ALREADY_VOTED`, `MAP_VOTING_CLOSED`,
      `MAP_PHOTO_TOO_LARGE`, `MAP_TRACE_OPT_IN_REQUIRED`,
      `MAP_CONTENT_VIOLATION`, `MAP_USER_MAP_BANNED`, `MAP_ALREADY_REPORTED`,
      `MAP_CANNOT_REPORT_OWN`

---

## Real-Time Checklist

- [x] `map:features:activated` Redis channel published when a feature goes
      active
- [x] WebSocket server subscribes and broadcasts feature-activated events to
      bounding-box subscribers
- [x] `map:leaderboard:monthly:{YYYY-MM}` Redis sorted set incremented on every
      map-points ledger write

---

## Mobile Checklist

- [x] `mapContributionQueue` persistent queue in `@hakwa/api-client` using
      `AsyncStorage`
- [x] NetInfo connectivity listener drains queue on reconnect
- [x] Queued submissions include device-recorded GPS coordinates and device
      timestamp
- [x] Server records both device timestamp and server-receipt timestamp
- [x] `<ContributionSheet />` component in `@hakwa/ui-native`
- [x] `<VerificationCard />` component in `@hakwa/ui-native`
- [x] `<MissionCard />` component in `@hakwa/ui-native` and `@hakwa/ui-web`
- [x] `<ZoneProgressLayer />` map overlay in `@hakwa/map`
- [x] Driver opt-in toggle for passive road tracing in DriverApp settings screen

---

## Workers & Scheduled Jobs Checklist

- [x] Mission scheduler job in `api/src/jobs/mapMissions.ts` runs Monday UTC
      midnight
- [x] Mission expiry job runs Sunday 23:59:59 UTC
- [x] Road-trace worker in `@hakwa/workers` wired to trip-completed event
- [x] Zone progress service in `api/src/services/mapZone.ts` wired to
      feature-activated event
- [x] Zone milestone threshold detection and notification dispatch (50% and
      100%)
- [x] Pioneer bonus evaluated inside zone progress service (RETURNING = 1 check)
- [x] Nightly `map-abuse-check` job in `api/src/jobs/mapAbuseCheck.ts` —
      identifies voting-ring pairs (FR-039)
- [x] Abuse-check job upserts into `mapAbuseFlag`
      (`ON CONFLICT (userId, flagType) DO UPDATE`) — no new rows on repeat
- [x] Content screener function `mapSafety.ts` in `@hakwa/core` — loaded at
      server startup (NFR-007)
- [x] `map-blocklist.json` config file in `api/src/config/` —
      version-controlled, updated via PR

---

## Compliance & Licensing

- [x] ODbL attribution documented in the app's About / Legal screen
- [x] One-time contributor consent screen shown on first map contribution (see
      Open Question 5)
- [x] OSM attribution rendered on all map views (existing `@hakwa/map`
      requirement, reconfirmed)

---

## Requirements Quality Checklist (Spec Writing Unit Tests)

**Purpose**: Validate requirement quality for maps data quality, crowdsourcing
workflows, safety/abuse controls, and performance/availability. **Created**:
2026-03-17 **Depth**: Standard **Primary Actor**: Spec author

### Requirement Completeness

- [x] CHK001 Are requirements defined for contribution edit or withdrawal after
      initial submission, including allowed states and time windows? [Gap]
- [x] CHK002 Are requirements defined for moderator SLA and queue-priority
      ordering when `pending_review` and `under_review` backlog grows? [Gap]
- [x] CHK003 Are requirements defined for how duplicate submissions are handled
      after a proximity warning is shown (allow, block, or merge policy)? [Gap,
      Spec §FR-017]
- [x] CHK004 Are requirements defined for mission generation fallback when fewer
      than `MAP_MISSIONS_PER_WEEK` templates are eligible in a week? [Gap, Spec
      §FR-023]
- [x] CHK005 Are requirements defined for leaderboard ties beyond score
      (secondary sort key and deterministic ordering)? [Gap, Spec §FR-013]
- [x] CHK006 Are requirements defined for stale feature reactivation criteria
      and ownership of re-open decisions? [Gap, Spec §FR-014]

### Requirement Clarity

- [x] CHK007 Is "outside Fiji bounding box" specified with a canonical polygon
      source and versioning policy rather than only a verbal boundary statement?
      [Clarity, Spec §FR-002]
- [x] CHK008 Is "proximity warning" behavior explicit about UI severity,
      blocking behavior, and whether user override is allowed? [Ambiguity, Spec
      §FR-017]
- [x] CHK009 Is "novel road km" calculation defined with exact distance
      algorithm/tolerance to avoid implementation variance? [Ambiguity, Spec
      §FR-022]
- [x] CHK010 Is "under review removed from all map layers" explicit about cache
      propagation deadline and client refresh trigger semantics? [Clarity, Spec
      §FR-031]
- [x] CHK011 Is "active features served from Redis" explicit about stale-data
      tolerance during cache misses and refresh contention? [Clarity, Spec
      §NFR-002]
- [x] CHK012 Is "read-only with respect to bans" in abuse job requirements
      explicit about allowed side effects (logs, metrics, notifications)?
      [Clarity, Spec §FR-039]

### Requirement Consistency

- [x] CHK013 Do moderation status transitions in safety stories align with
      lifecycle transitions in core activation/rejection stories without
      conflicting terminal states? [Consistency, Spec §User Story 3, Spec §User
      Story 11]
- [x] CHK014 Do points-award requirements for `pending_review`, admin approval,
      and rejection remain internally consistent about when ledger writes are
      created or withheld? [Consistency, Spec §FR-028, Spec §FR-029, Spec
      §FR-034]
- [x] CHK015 Do daily limits, rate limits, and abuse thresholds use consistent
      UTC boundary rules across contribution, verification, and trace workflows?
      [Consistency, Spec §FR-003, Spec §NFR-004, Spec §FR-039]
- [x] CHK016 Do trust-tier definitions and ban behavior remain consistent
      between stats response semantics and request-gating semantics?
      [Consistency, Spec §FR-035, Spec §FR-038]
- [x] CHK017 Do report-triggered `under_review` rules align with trusted-dispute
      instant escalation rules when both triggers occur near-simultaneously?
      [Conflict, Spec §FR-031, Spec §FR-036]

### Acceptance Criteria Quality

- [x] CHK018 Are acceptance scenarios mapped to each FR/NFR with explicit
      pass/fail observables rather than narrative-only outcomes? [Measurability,
      Spec §Requirements]
- [x] CHK019 Are latency targets measurable under defined load profiles, data
      cardinalities, and percentile windows for all latency-sensitive endpoints?
      [Measurability, Spec §NFR-001, Spec §NFR-007]
- [x] CHK020 Are mission and streak completion criteria objectively testable
      with exact UTC rollover rules and idempotency expectations?
      [Measurability, Spec §FR-023, Spec §FR-027]
- [x] CHK021 Are moderation audit requirements measurable with required fields,
      immutability conditions, and retention horizon stated explicitly?
      [Measurability, Spec §FR-033]

### Scenario Coverage

- [x] CHK022 Are primary flow requirements complete from submission through
      verification to activation/rejection with no undefined transition path?
      [Coverage, Spec §FR-001..FR-006]
- [x] CHK023 Are alternate flow requirements defined for low-quality but
      non-malicious submissions that should remain reviewable without immediate
      rejection? [Coverage, Spec §FR-028]
- [x] CHK024 Are exception flow requirements defined for partial failures where
      DB transaction succeeds but async side effects (cache refresh,
      notification) fail? [Gap, Exception Flow]
- [x] CHK025 Are recovery flow requirements defined for replaying offline queued
      submissions after prolonged disconnect and token expiration? [Coverage,
      Spec §FR-020]
- [x] CHK026 Are non-functional scenario requirements defined for degraded Redis
      availability on leaderboard and active-layer reads? [Gap, Non-Functional]

### Edge Case Coverage

- [x] CHK027 Are requirements explicit for concurrent last-vote races where
      activation and rejection thresholds are both reached by near-simultaneous
      requests? [Edge Case, Spec §FR-005, Spec §FR-006]
- [x] CHK028 Are requirements explicit for duplicate moderation actions on the
      same feature (idempotent approve/reject behavior)? [Edge Case, Spec
      §FR-032, Spec §FR-033]
- [x] CHK029 Are requirements explicit for zone-boundary geometries where a
      feature intersects multiple zones (assignment or split policy)? [Gap, Spec
      §FR-024]
- [x] CHK030 Are requirements explicit for malformed or unreachable `photoUrl`
      values after pre-upload success but before contribution submission? [Edge
      Case, Spec §FR-021, Spec §NFR-005]
- [x] CHK031 Are requirements explicit for trust-tier downgrade timing when
      accepted-contribution count changes due to moderation reversal events?
      [Edge Case, Spec §FR-035]

### Non-Functional Requirements Quality

- [x] CHK032 Are throughput/concurrency targets defined for write-heavy
      verification spikes, not only query latency for bounding-box reads? [Gap,
      Spec §NFR-001, Spec §NFR-003]
- [x] CHK033 Are availability requirements defined for moderation and safety
      controls during dependency outages (Redis, push provider, blocklist load
      failure)? [Gap, Non-Functional]
- [x] CHK034 Are data-retention and deletion requirements defined for reports,
      abuse flags, and moderation logs beyond "append-only" wording? [Gap, Spec
      §FR-033, Spec §FR-039]
- [x] CHK035 Are privacy requirements explicit for device timestamps, trace
      data, and user-generated photos, including redaction/export boundaries?
      [Gap, Spec §FR-020, Spec §FR-022, Spec §FR-021]

### Dependencies & Assumptions

- [x] CHK036 Are assumptions about external content-screening quality and
      false-positive rates explicitly documented with mitigation requirements?
      [Assumption, Spec §FR-028, Spec §NFR-007]
- [x] CHK037 Are dependencies on role claims (`admin`, `map_moderator`) and
      identity source-of-truth documented with conflict resolution rules?
      [Dependency, Spec §FR-032, Spec §NFR-008]
- [x] CHK038 Are assumptions about map zone seed-data governance and update
      ownership defined to avoid stale operational boundaries? [Assumption, Spec
      §FR-024]

### Ambiguities & Conflicts

- [x] CHK039 Is the distinction between `pending_review` and `under_review`
      fully specified in terms of entry triggers, queue visibility, and exit
      paths? [Ambiguity, Spec §FR-028, Spec §FR-031, Spec §FR-032]
- [x] CHK040 Is reconciliation behavior specified when trusted-dispute
      escalation and third-report escalation target the same feature in
      overlapping windows? [Conflict, Spec §FR-031, Spec §FR-036]
- [x] CHK041 Is the policy explicit for whether previously awarded verification
      points are ever reversed on moderator rejection after activation?
      [Ambiguity, Spec §FR-034]
- [x] CHK042 Is a canonical requirement-ID-to-task traceability matrix defined
      so each CHK finding maps to spec sections and implementation tasks?
      [Traceability, Gap]
