---
description: "Task list for Hakwa Maps — Crowdsourced Data Collection"
---

# Tasks: Hakwa Maps — Crowdsourced Data Collection

**Feature Branch**: `009-hakwa-maps-crowdsourcing` **Input**: plan.md, spec.md,
data-model.md **Tech Stack**: TypeScript 5.x, Drizzle ORM, PostgreSQL, Redis
(Sorted Set, pub/sub, Hash), `@hakwa/workers`, `@hakwa/notifications`,
`@hakwa/core`, `@hakwa/ui-native`, Expo / React Native

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US11)
- All paths relative to repo root

---

## Phase 1: Setup (Schema)

**Purpose**: Define all map tables and extend gamification enums before any
route or worker code can be written

- [ ] T001 Define `mapFeature` table (id, contributorId FK→user, type, name,
      category, description, geometryJson, photoUrl, status enum
      `pending|active|rejected|stale|pending_review|under_review`, confirmCount,
      disputeCount, osmRef, osmLicence default `ODbL`, gpxAccuracyM,
      gpsVelocityFlag, expiresAt, createdAt, updatedAt) with indexes on
      `status`, `contributorId`, `createdAt` in `pkg/db/schema/map.ts`
- [ ] T002 Define `mapVerification` table (id, featureId FK→mapFeature, userId
      FK→user, vote `confirm|dispute`, disputeCategory nullable, note nullable,
      createdAt) with `UNIQUE(featureId, userId)` in `pkg/db/schema/map.ts`
- [ ] T003 [P] Define `mapContributorStats` table (id, userId UNIQUE FK→user,
      totalContributions, acceptedContributions, totalVerifications, mapStreak,
      mapStreakCheckpoint, rideImpactCount, updatedAt) in `pkg/db/schema/map.ts`
- [ ] T004 [P] Define `mapZone` table (id, slug UNIQUE, displayName,
      geometryJson, targetFeatureCount, currentFeatureCount default 0,
      createdAt) and `mapFeatureReport` table (id, featureId FK, reporterId FK,
      reason, note, status default `open`, createdAt) with
      `UNIQUE(featureId, reporterId)` in `pkg/db/schema/map.ts`
- [ ] T005 [P] Define `mapContributorTrust` table (id, userId UNIQUE FK→user,
      isMapBanned default false, banReason, banExpiresAt, contentFlagCount,
      updatedAt) and `mapModerationLog` table (id, featureId, moderatorId,
      action, note, createdAt) in `pkg/db/schema/map.ts`
- [ ] T006 [P] Define `mapMission` table (id, weekStart, deadline, actionType,
      targetCount, zoneId nullable FK→mapZone, pointsBonus) and
      `mapMissionProgress` table (id, missionId FK, userId FK, progressCount,
      status `in_progress|completed|expired`, updatedAt) with
      `UNIQUE(missionId, userId)` in `pkg/db/schema/map.ts`
- [ ] T007 [P] Define `mapRoadTrace` table (id, tripId nullable FK→trip,
      driverId FK→user, traceGeoJson, novelKm, pointsAwarded, processedAt) in
      `pkg/db/schema/map.ts`
- [ ] T008 Extend `pointsSourceActionEnum` in `pkg/db/schema/gamification.ts`
      with map action values: `map_contribution`, `map_verification`,
      `map_contribution_accepted`, `map_road_trace`, `map_mission_completed`,
      `map_pioneer_bonus`
- [ ] T009 Add map-action constants to `pkg/core/src/gamificationConstants.ts`:
      `MAP_POINTS_CONTRIBUTION` (25), `MAP_POINTS_VERIFICATION` (5),
      `MAP_POINTS_ACCEPTED_BONUS` (50), `MAP_POINTS_PIONEER_BONUS` (75),
      `MAP_POINTS_MISSION_BONUS` (100), `MAP_DAILY_LIMIT_FEATURES` (20),
      `MAP_ACTIVATION_THRESHOLD` (3), `MAP_REJECTION_THRESHOLD` (3),
      `MAP_GPS_MAX_VELOCITY_KM_H` (250), `MAP_ROAD_TRACE_DAILY_CAP_PTS` (50)
- [ ] T010 Export all map entities from `pkg/db/schema/index.ts` and run
      `db-push` to apply schema; seed `mapZone` rows for initial Fiji zones
      (Suva CBD, Nadi Town, Lautoka, Labasa, Sigatoka Valley) and initial map
      badges in `badge` table

---

## Phase 2: Foundational (Safety + Content Screener)

**Purpose**: Safety infrastructure must exist before any contribution submission
endpoint is implemented

**⚠️ CRITICAL**: Content screener, GPS velocity check, and ban check must all
run synchronously inside `POST /map/features` before any DB transaction opens

- [ ] T011 Create `api/src/config/map-blocklist.json` with initial blocked
      keywords array; implement `pkg/core/src/mapSafety.ts` with
      `screenContent({ name, description }): "pass" | "flag" | "auto_reject"` —
      loads blocklist on import, matches against compiled `Set<string>` and
      `RegExp[]`
- [ ] T012 Implement trust-tier and ban check helper in
      `pkg/core/src/mapSafety.ts`: `getContributorTrust(userId)` — query
      `mapContributorTrust` (lazy create); derive tier from
      `acceptedContributions`: 0–9 = `standard`, 10–49 = `trusted`, 50+ =
      `senior`; return `{ isBanned, tier }`
- [ ] T013 [P] Implement GPS velocity check utility in
      `pkg/core/src/mapSafety.ts`: `checkGpsVelocity(userId, lat, lng, db)` —
      fetch most recent `mapFeature.createdAt + geometryJson` for user;
      haversine distance ÷ elapsed minutes; return `boolean` flagged if >
      `MAP_GPS_MAX_VELOCITY_KM_H`
- [ ] T014 [P] Implement haversine distance utility in `pkg/core/src/geo.ts` for
      same-service spatial queries (used by velocity check and road-trace
      worker)

---

## Phase 3: User Story 1 + User Story 11 — Submit Contribution & Safety Enforcement (Priority: P1) 🎯 MVP

**Goal**: Logged-in user submits a map feature; content screener runs
synchronously; GPS accuracy and daily rate limit are enforced; `mapFeature` row
inserted with correct initial status; points awarded async via gamification
event.

**Independent Test**: Valid submission → `mapFeature` row with
`status = pending`; `map_contribution` `pointsLedger` entry via gamification
stream; `mapContributorStats.totalContributions` incremented. Blocked-keyword
submission → `status = pending_review`, no ledger entry (screener test is
independent).

- [ ] T015 [US1] [US11] Implement `POST /api/map/features` in
      `api/src/routes/map.ts`: (1) require session, (2) `getContributorTrust` →
      reject if `isBanned`, (3) `screenContent` → if `auto_reject` return 400;
      if `flag` insert with `status = pending_review` and no points, (4) enforce
      daily rate limit (count user's `mapFeature.createdAt` >= today) → 429 if ≥
      `MAP_DAILY_LIMIT_FEATURES`, (5) enforce GPS accuracy ≤ 50 m from
      `gpxAccuracyM`, (6) `checkGpsVelocity` → set `gpsVelocityFlag = true` if
      fired, (7) insert `mapFeature` row and `mapContributorStats` upsert in
      transaction; (8) publish `map_contribution` event to `gamification:events`
      stream for points
- [ ] T016 [P] [US11] Implement `POST /api/map/features/:id/report` in
      `api/src/routes/map.ts` — session required;
      `UNIQUE(featureId, reporterId)` constraint prevents duplicates; reporter ≠
      contributor enforced; if report count reaches `MAP_REPORT_THRESHOLD` (3):
      atomically transition `status` to `under_review`, notify original
      contributor, publish `map:features:under_review` Redis pub/sub for
      moderator dashboard
- [ ] T017 [P] [US1] Implement `GET /api/map/features` (pending layer) in
      `api/src/routes/map.ts` — return `status = pending` features for the
      requesting user including own submissions; optionally filter by `?bbox`

**Checkpoint**: User Story 1 + 11 (submission + safety) complete — features are
submitted with screener enforcement and async gamification points

---

## Phase 4: User Story 2 — Verify a Pending Contribution (Priority: P1)

**Goal**: Any user (except the contributor) can confirm or dispute a pending
feature; `mapVerification` row created; vote counters incremented; points
awarded; duplicate and self-vote prevented.

**Independent Test**: `POST /api/map/features/:id/verify` with `vote = confirm`
→ `mapVerification` row created; feature `confirmCount` incremented;
`map_verification` gamification event published; second vote by same user → 409.

- [ ] T018 [US2] Implement `POST /api/map/features/:id/verify` in
      `api/src/routes/map.ts`: (1) session required, (2) verify
      `mapFeature.status = pending`, (3) reject if
      `feature.contributorId === userId` (self-vote → 403), (4)
      `INSERT INTO mapVerification ON CONFLICT (featureId, userId) DO NOTHING` —
      if rowCount = 0 return 409 `MAP_ALREADY_VOTED`, (5)
      `UPDATE mapFeature SET confirmCount (or disputeCount) += 1`; (6) upsert
      `mapContributorStats.totalVerifications += 1` in same transaction; (7)
      publish `map_verification` gamification event
- [ ] T019 [P] [US2] Serve verification card data at `GET /api/map/features/:id`
      — return feature with submitter first name, photo, type, category, status,
      confirmCount, disputeCount; include `isOwnSubmission` boolean

**Checkpoint**: User Story 2 complete — community voting is functional with
idempotency and self-vote guard

---

## Phase 5: User Story 3 — Feature Activation, Rejection & Status Transitions (Priority: P1)

**Goal**: Reaching `ACTIVATION_THRESHOLD` confirms transitions to `active`;
reaching `REJECTION_THRESHOLD` disputes transitions to `rejected`; zone counter
incremented on activation; pioneer bonus check; nightly stale job.

**Independent Test**: Drive `confirmCount` to 3 → `status = active`; drive
`disputeCount` to 3 → `status = rejected`; zone `currentFeatureCount`
incremented without touching missions, leaderboard, or badges.

- [ ] T020 [US3] Implement `checkActivationThreshold` service in
      `api/src/services/mapFeatureService.ts` — called after vote insert; if
      `confirmCount >= MAP_ACTIVATION_THRESHOLD`: atomically
      `UPDATE mapFeature SET status = 'active', expiresAt = NULL`; increment
      `mapZone.currentFeatureCount` via zone point-in-polygon check in
      `api/src/services/mapZoneService.ts`; publish `map:features:activated`
      Redis pub/sub; award `map_contribution_accepted` bonus (50 pts) to
      original contributor via gamification stream
- [ ] T021 [US3] Implement rejection in same service — if
      `disputeCount >= MAP_REJECTION_THRESHOLD`:
      `UPDATE mapFeature SET status = 'rejected'`; feature removed from all map
      layers
- [ ] T022 [P] [US3] Implement `mapZoneService.ts` in
      `api/src/services/mapZoneService.ts` — `getZoneForPoint(lat, lng)`: load
      zone polygons (cached in Redis `map:zones:all` JSON with TTL 1 h);
      point-in-polygon check; return matching `mapZone` or null
- [ ] T023 [P] [US3] Implement nightly stale cleanup job in
      `api/src/jobs/mapStaleCleaner.ts` —
      `UPDATE mapFeature SET status = 'stale' WHERE status = 'pending' AND expiresAt < now()`
      and `confirmCount + disputeCount < 2`; scheduled at 02:00 UTC daily
- [ ] T024 [P] [US3] Subscribe to `map:features:activated` pub/sub in
      `api/src/websocket.ts` — broadcast real-time map layer update to all
      connected clients

**Checkpoint**: User Story 3 complete — feature lifecycle state machine is
implemented including activation, rejection, stale, and zone side-effects

---

## Phase 6: User Story 4 — Map Badges & Milestones (Priority: P2)

**Goal**: Map-specific badges awarded idempotently on contribution/verification
milestones; `badge_earned` gamification event triggers notification.

**Independent Test**: Drive `acceptedContributions` to 1 →
`map_first_contribution` badge awarded; drive to 10 → `map_10_accepted`; drive
`totalVerifications` to 25 → `map_25_verifications`; all via badge worker
independent of other systems.

- [ ] T025 [US4] Add map badge seeds to `badge` table: `map_first_contribution`,
      `map_10_accepted`, `map_local_expert` (50 accepted),
      `map_25_verifications`, `map_community_guardian` (100 verifications),
      `map_cartographer` (200+ actions + both `map_local_expert` and
      `map_community_guardian`), `map_pioneer`, `map_explorer` (3 pioneered
      zones), `map_zone_complete`
- [ ] T026 [US4] Extend `evaluateBadges` in
      `pkg/workers/src/workers/gamificationProcessor.ts` to evaluate map badges
      from `mapContributorStats` — check after every `map_contribution`,
      `map_verification`, `map_contribution_accepted`, and `map_pioneer_bonus`
      gamification event; `INSERT INTO userBadge ON CONFLICT DO NOTHING`

**Checkpoint**: User Story 4 complete — map milestone badges are awarded
idempotently

---

## Phase 7: User Story 5 — Map Leaderboard (Priority: P2)

**Goal**: Monthly Redis Sorted Set tracks map points; top 50 returned with
enrichment; user's own rank included even outside top 50; monthly reset with TTL
archive.

**Independent Test**:
`ZADD map:leaderboard:monthly:{YYYY-MM} INCR {pts} {userId}` after ledger write;
`GET /api/gamification/map-leaderboard` returns top 50 with rank, name,
totalMapPoints, contributionCount, verificationCount.

- [ ] T027 [US5] After each `map_contribution`, `map_verification`,
      `map_contribution_accepted`, or `map_road_trace` gamification event
      processed, call
      `ZADD map:leaderboard:monthly:{YYYY-MM} INCR {points} {userId}` in
      `gamificationProcessor.ts`; set `EXPIREAT` to first day of month +3 months
- [ ] T028 [P] [US5] Implement `GET /api/gamification/map-leaderboard` in
      `api/src/routes/leaderboard.ts` —
      `ZREVRANGE map:leaderboard:monthly:{YYYY-MM} 0 49 WITHSCORES`; enrich with
      user names and `mapContributorStats` from DB; also return caller's
      `ZREVRANK` if outside top 50

**Checkpoint**: User Story 5 complete — monthly map leaderboard operational

---

## Phase 8: User Story 7 — Passive Road Tracing (Priority: P2)

**Goal**: Opted-in drivers submit GPS trace after trip completion; road-trace
worker computes novel km against active feature layer; points awarded up to
daily cap in `mapRoadTrace` table.

**Independent Test**: A `mapRoadTrace` row is inserted and `map_road_trace`
pointsLedger entry created for a 4.2 km novel-road trace, with
`pointsAwarded = 4` (floored novel km); driver with 51 pts from today gets
`pointsAwarded = 0` but trace still stored.

- [ ] T029 [US7] Add `passiveTracingEnabled` boolean column to user profile
      schema in `pkg/db/schema/auth-schema.ts`; expose
      `PATCH /api/me/preferences` toggle in `api/src/routes/auth.ts`
- [ ] T030 [US7] After `tripService.ts` trip completion, if
      `driver.passiveTracingEnabled = true`, publish
      `{ type: 'road_trace', driverId, tripId, traceGeoJson }` to
      `gamification:events` stream (raw trace must not be logged externally)
- [ ] T031 [US7] Implement `roadTraceWorker.ts` in
      `pkg/workers/src/workers/roadTraceWorker.ts` — Ramer–Douglas–Peucker line
      simplification; check each 50 m segment against active `mapFeature` bbox
      (within 20 m = non-novel); compute novel km; floor to integer; check daily
      cap (`MAP_ROAD_TRACE_DAILY_CAP_PTS`); insert `mapRoadTrace` row; insert
      `map_road_trace` `pointsLedger` entry if cap not hit; dispatch
      gamificationProcessor for points + notifications

**Checkpoint**: User Story 7 complete — opt-in passive road tracing awards
points for novel road km

---

## Phase 9: User Story 8 — Weekly Map Missions (Priority: P2)

**Goal**: Three `mapMission` rows created each Monday midnight UTC; per-user
`mapMissionProgress` updated on qualifying actions; all-three-complete triggers
100-pt bonus.

**Independent Test**: Monday cron creates 3 `mapMission` rows; submitting a POI
increments a `contribute_poi` mission `progressCount`; completing all 3 creates
`map_mission_completed` ledger entry.

- [ ] T032 [US8] Implement weekly mission scheduler in
      `api/src/jobs/mapMissions.ts` — `node-cron` Monday 00:00 UTC; insert 3
      `mapMission` rows from template config
      `api/src/config/map-mission-templates.json`; expire previous week's
      `mapMissionProgress` rows to `expired`
- [ ] T033 [US8] In `api/src/services/mapFeatureService.ts` and
      `api/src/routes/map.ts`, after contribution or verification committed,
      upsert `mapMissionProgress` (`UNIQUE(missionId, userId)`) for all active
      missions matching the action type; if `progressCount >= targetCount` mark
      `completed`
- [ ] T034 [P] [US8] Check if all 3 current-week missions are `completed` for
      user after each progress update — if so, insert `map_mission_completed`
      `pointsLedger` entry (100 pts) and push notification

**Checkpoint**: User Story 8 complete — weekly missions with bonus completion
award are functional

---

## Phase 10: User Story 6, 9, 10 — Browse Contributions, Neighbourhood Progress, Pioneer (Priority: P3)

**US6**: Browse and filter pending contributions by bbox/type/age **US9**:
Neighbourhood progress with zone completion percentage and threshold
notifications **US10**: Pioneer bonus and map_pioneer/map_explorer badges

- [ ] T035 [P] [US6] Implement `GET /api/map/features` with query params
      `?bbox=lat1,lng1,lat2,lng2&type=poi|road_correction|area|route_stop&sort=oldest|newest`
      in `api/src/routes/map.ts` — paginate 20 per page; application-layer bbox
      filter on `geometry_json` centroid
- [ ] T036 [P] [US9] Implement zone progress side-effect in `mapZoneService.ts`
      — after zone `currentFeatureCount` increment: compute
      `pct = currentFeatureCount / targetFeatureCount * 100`; write to
      `HSET map:zone:{id} pct {value} featureCount {n}`; if crossing 50% band
      send broadcast notification to zone contributors; if 100% award
      `map_zone_complete` badge to all contributors (idempotent)
- [ ] T037 [P] [US9] Implement `GET /api/map/zones` in `api/src/routes/map.ts` —
      return all zones with cached completion % from Redis;
      `GET /api/map/zones/:id` — zone detail with top 3 contributors by
      `acceptedContributions`
- [ ] T038 [P] [US10] Implement pioneer detection in `checkActivationThreshold`
      in `mapFeatureService.ts` — after
      `UPDATE mapZone SET currentFeatureCount += 1 RETURNING currentFeatureCount`:
      if `RETURNING = 1` insert `map_pioneer_bonus` `pointsLedger` entry (75
      pts) and award `map_pioneer` badge; trigger `map_explorer` badge check if
      user has pioneered 3+ zones
- [ ] T039 [P] [US6] Build verification swipe UI in
      `apps/mobile/rider/src/screens/communityMap/VerificationStack.tsx` — stack
      of `VerificationCard` components from `@hakwa/ui-native`; swipe left =
      dispute, swipe right = confirm; call `POST /api/map/features/:id/verify`
      on gesture end

---

## Phase 11: User Story 11 — Admin Moderation Queue (Priority: P1)

**Goal**: Moderators can review `pending_review` and `under_review` features via
admin API; approve/reject with audit log; ban contributors.

**Independent Test**: `GET /admin/map/moderation/queue` returns features with
`status IN (pending_review, under_review)` ordered by `createdAt ASC`; approve
action transitions to `pending` and awards withheld points in a single atomic
transaction.

- [ ] T040 [US11] Implement `GET /admin/map/moderation/queue` in
      `api/src/routes/admin/mapModeration.ts` — require `role = admin`;
      paginated query
      `WHERE status IN ('pending_review', 'under_review') ORDER BY created_at ASC`
- [ ] T041 [US11] Implement `POST /admin/map/moderation/:id/approve` — if
      `pending_review`: transition to `pending`, award withheld
      `map_contribution` points, log to `mapModerationLog`; if `under_review`:
      transition to `active`, invalidate Redis zone cache, notify contributor
- [ ] T042 [P] [US11] Implement `POST /admin/map/moderation/:id/reject` —
      transition to `rejected`; no point reversal; notify contributor; log to
      `mapModerationLog`
- [ ] T043 [P] [US11] Implement `POST /admin/map/contributors/:userId/ban` —
      upsert `mapContributorTrust` with `isBanned = true`, `banReason`,
      `banExpiresAt`; log to `mapModerationLog`

**Checkpoint**: User Story 11 complete — three-layer safety (content screener +
community reports + admin moderation) is operational

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Publish `map_contribution` events to gamification notifier so
      `@hakwa/notifications` fires push: _"You earned 25 pts for your map
      contribution!"_
- [ ] T045 [P] Add `map_contribution` and `map_verification` actions to
      `gamificationProcessor.ts` event handler routing
- [ ] T046 [P] Implement nightly abuse-check job in
      `api/src/jobs/mapAbuseCheck.ts` — aggregation query over
      `mapVerification + mapFeature` to detect mutual confirmation pairs within
      30 days; upsert `mapAbuseFlag` rows (read-only enforcement; human review
      required)
- [ ] T047 [P] Build `ContributionSheet` component in `@hakwa/ui-native` — name
      input, category picker, optional note and photo attachment; shown on map
      long-press
- [ ] T048 [P] Build `VerificationCard` component in `@hakwa/ui-native` — shows
      name, type, photo, submitter first-name; Confirm/Dispute buttons with
      optional note

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Safety utilities) → Phase 3 (Submit + Safety enforcement) ← CRITICAL PATH
Phase 3 (mapFeature exists) → Phase 4 (Verify) → Phase 5 (Activation transitions)
Phase 5 → Phase 6 (Map badges after activation stats exist)
Phase 5 → Phase 7 (Leaderboard after points awarded)
Phase 2 → Phase 8 (US7 road tracing after tripService integration)
Phase 3 → Phase 9 (US8 missions after contribution actions exist)
Phase 5 → Phase 10 (US9/US10 zone/pioneer after activation hook exists)
Phase 2+3 → Phase 11 (Admin moderation after screener + report exist)
```

## Parallel Execution Examples

- T003 + T004 + T005 + T006 + T007 can run in parallel (separate table
  definitions)
- T011 + T013 + T014 can run in parallel (screener, velocity check, geo utils)
- T016 + T017 can run in parallel (report route vs pending layer GET)
- T035 + T036 + T037 + T038 can run in parallel (independent P3 features)
- T040 + T041 + T042 + T043 can run in parallel (separate moderation endpoints)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T017) — contribution submission
  with safety enforcement
- **MVP+**: Add Phase 4 + Phase 5 (T018–T024) — verification + feature
  activation pipeline
- **Full P2**: Add Phase 6–9 (T025–T034) — badges, leaderboard, road tracing,
  missions
- **Complete**: Add Phase 10 + 11 + Polish (T035–T048)

**Total tasks**: 48 | **Parallelizable**: 22 | **User stories**: 11
