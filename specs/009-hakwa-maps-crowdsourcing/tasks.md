# Tasks: Hakwa Maps - Crowdsourced Data Collection

**Input**: Design documents from `specs/009-hakwa-maps-crowdsourcing/`  
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`,
`data-model.md`, `contracts/rest-api.md`, `quickstart.md`

**Tests**: Included. The feature specification requires scenario testing and
measurable outcomes.

**Organization**: Tasks are grouped by user story for independent implementation
and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel (different files, no dependency on
  incomplete tasks)
- **[Story]**: User story label (`[US1]` ... `[US11]`)
- Every task includes a concrete file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize schema and shared map modules required by all stories.

- [x] T001 Create map schema module and base exports in `pkg/db/schema/map.ts`
- [x] T002 [P] Export map schema from root schema barrel in
      `pkg/db/schema/index.ts`
- [x] T003 [P] Add map action constants and Fiji bounds constants in
      `pkg/core/src/gamificationConstants.ts`
- [x] T004 [P] Add geometry validation and precision helpers in
      `pkg/core/src/geometry/validate.ts`
- [x] T005 [P] Add Ramer-Douglas-Peucker simplification utility in
      `pkg/core/src/geometry/rdp.ts`
- [x] T006 [P] Add map request/response contracts for API and clients in
      `pkg/types/src/map.ts`
- [x] T006A [P] Create workspace package scaffold for shared types in
      `pkg/types/package.json`
- [x] T006B [P] Add shared types package entrypoint and exports in
      `pkg/types/index.ts`
- [x] T006C [P] Create workspace package scaffold for shared API client in
      `pkg/api-client/package.json`
- [x] T006D [P] Add shared API client entrypoint and exports in
      `pkg/api-client/index.ts`
- [x] T007 Register map routes placeholder and router mount in
      `api/src/index.ts`
- [x] T008 [P] Add map mission template definitions in
      `api/src/jobs/missionTemplates.ts`
- [x] T009 Add map zone seed script shell in `api/src/jobs/seedMapZones.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core persistence, safety, and async infrastructure that blocks all
stories.

**CRITICAL**: Complete this phase before any user story implementation.

- [x] T010 Define `map_feature`, `map_verification`, and `map_contributor_stats`
      tables in `pkg/db/schema/map.ts`
- [x] T011 [P] Define `map_zone`, `map_mission`, and `map_mission_progress`
      tables in `pkg/db/schema/map.ts`
- [x] T012 [P] Define `map_road_trace`, `map_feature_report`,
      `map_contributor_trust`, `map_moderation_log`, and `map_abuse_flag` tables
      in `pkg/db/schema/map.ts`
- [x] T013 Extend map points source actions in `pkg/db/schema/gamification.ts`
- [x] T014 Implement map safety and trust helpers (ban check, trust tier,
      content screening) in `api/src/services/mapSafetyService.ts`
- [x] T015 [P] Implement map repository data access layer with transactional
      helpers in `api/src/services/mapRepository.ts`
- [x] T016 [P] Implement Redis cache/leaderboard/zone key helpers in
      `api/src/services/mapRedisService.ts`
- [x] T017 Add map-specific error codes and mappers in
      `pkg/errors/src/mapErrors.ts`
- [x] T018 Apply schema and verify migration state with db push docs update in
      `pkg/db/README.md`
- [x] T018A Create official-doc verification log for external dependencies and
      tools in `specs/009-hakwa-maps-crowdsourcing/research.md`
- [x] T018B Add implementation gate checklist requiring official-doc
      confirmation before each story phase in
      `specs/009-hakwa-maps-crowdsourcing/tasks.md`
- [x] T018C [P] Add version/source references (Express, Drizzle, Redis, Expo
      NetInfo, AsyncStorage) in `specs/009-hakwa-maps-crowdsourcing/research.md`

**Checkpoint**: Foundation complete; user story phases can proceed in priority
order or in parallel by team.

### Official Documentation Gate (Required Before Each Story Phase)

- [ ] Confirm relevant framework/library docs were reviewed and version-checked.
- [ ] Record any behavior assumptions and API compatibility notes in
      `research.md`.
- [ ] Re-validate endpoint and schema decisions against the latest official
      docs.

---

## Phase 3: User Story 1 - Submit a Map Contribution (Priority: P1) MVP

**Goal**: Authenticated rider/driver can submit map features with validation,
pending status, and contribution points.

**Independent Test**: Valid contribution creates `map_feature` (`pending`) and
ledger updates, then appears in pending list for contributor.

### Tests for User Story 1

- [x] T019 [P] [US1] Add contract tests for `POST /api/v1/map/features` in
      `api/tests/contract/map.submit.contract.test.ts`
- [x] T020 [P] [US1] Add integration tests for GPS accuracy, daily cap, and
      photo bonus in `api/tests/integration/map.submit.integration.test.ts`
- [x] T020A [P] [US1] Add contract tests ensuring binary photo payloads are
      rejected and URL-only submissions are accepted in
      `api/tests/contract/map.photoUpload.contract.test.ts`

### Implementation for User Story 1

- [x] T021 [US1] Implement `POST /api/v1/map/features` handler in
      `api/src/routes/map.ts`
- [x] T022 [US1] Implement submission service transaction (feature insert +
      stats + points events) in `api/src/services/mapContributionService.ts`
- [x] T023 [P] [US1] Implement out-of-bounds and coordinate sanitization checks
      in `api/src/services/mapValidationService.ts`
- [x] T024 [P] [US1] Implement duplicate proximity warning lookup logic in
      `api/src/services/mapQueryService.ts`
- [x] T025 [US1] Implement `GET /api/v1/map/features/pending`
      contributor-visible query in `api/src/routes/map.ts`
- [x] T026 [US1] Add map contribution client calls in shared API client in
      `pkg/api-client/src/mapClient.ts`
- [x] T026E [P] [US1] Implement pre-upload endpoint for contribution photos and
      signed upload response in `api/src/routes/mapUploads.ts`
- [x] T026F [US1] Implement photo upload service (size validation + trusted URL
      output) in `api/src/services/mapPhotoUploadService.ts`
- [x] T026G [P] [US1] Add client pre-upload flow before submit in
      `pkg/api-client/src/mapPhotoUploadClient.ts`
- [x] T026A [P] [US1] Implement offline contribution queue storage and enqueue
      API in `pkg/api-client/src/mapContributionQueue.ts`
- [x] T026B [US1] Implement connectivity listener and queue drain on reconnect
      for passenger app in
      `apps/mobile/passenger/src/app/bootstrap/mapQueueBootstrap.ts`
- [x] T026C [US1] Implement connectivity listener and queue drain on reconnect
      for driver app in
      `apps/mobile/driver/src/app/bootstrap/mapQueueBootstrap.ts`
- [x] T026D [P] [US1] Add integration tests for offline enqueue and reconnect
      replay in `api/tests/integration/map.offlineQueue.integration.test.ts`

**Checkpoint**: US1 independently functional and testable.

---

## Phase 4: User Story 2 - Verify a Pending Contribution (Priority: P1)

**Goal**: Users can confirm/dispute other users' pending features with one vote
per feature and points award.

**Independent Test**: Non-owner can cast confirm/dispute once; duplicate vote
and self-verification are blocked.

### Tests for User Story 2

- [x] T027 [P] [US2] Add contract tests for
      `POST /api/v1/map/features/:id/verify` in
      `api/tests/contract/map.verify.contract.test.ts`
- [x] T028 [P] [US2] Add integration tests for double-vote and self-vote
      rejection in `api/tests/integration/map.verify.integration.test.ts`

### Implementation for User Story 2

- [x] T029 [US2] Implement verify endpoint and request validation in
      `api/src/routes/map.ts`
- [x] T030 [US2] Implement vote insert and idempotency enforcement in
      `api/src/services/mapVerificationService.ts`
- [x] T031 [P] [US2] Implement verification card feature detail query in
      `api/src/services/mapQueryService.ts`
- [x] T032 [P] [US2] Add verification calls in API client for mobile/web in
      `pkg/api-client/src/mapClient.ts`
- [x] T033 [US2] Add verification interaction hook for UI clients in
      `pkg/api-client/src/hooks/useMapVerification.ts`

**Checkpoint**: US2 independently functional and testable.

---

## Phase 5: User Story 3 - Feature Goes Active / Rejected (Priority: P1)

**Goal**: Threshold-based transition from pending to active/rejected with voting
closure and stale cleanup.

**Independent Test**: Incrementing vote counters drives deterministic state
transitions without relying on badges/leaderboard.

### Tests for User Story 3

- [x] T034 [P] [US3] Add integration tests for activation/rejection thresholds
      in `api/tests/integration/map.lifecycle.integration.test.ts`
- [x] T035 [P] [US3] Add concurrency tests for atomic threshold transitions in
      `api/tests/integration/map.lifecycle.concurrency.test.ts`

### Implementation for User Story 3

- [x] T036 [US3] Implement threshold transition logic with row locking in
      `api/src/services/mapLifecycleService.ts`
- [x] T037 [P] [US3] Implement `GET /api/v1/map/features/active` GeoJSON
      endpoint in `api/src/routes/map.ts`
- [x] T038 [P] [US3] Implement active layer cache invalidation and refresh in
      `api/src/services/mapRedisService.ts`
- [x] T039 [US3] Implement nightly stale transition job in
      `api/src/jobs/mapStaleCleanupJob.ts`
- [x] T040 [US3] Implement re-open flow from active to pending with fresh vote
      slate in `api/src/services/mapLifecycleService.ts`

**Checkpoint**: US3 independently functional and testable.

---

## Phase 6: User Story 11 - Safety, Moderation & Trust (Priority: P1)

**Goal**: Harmful content handling, report escalation, moderator queue/actions,
and trust-tier enforcement.

**Independent Test**: Blocklist-triggered submission becomes `pending_review`
with no points; moderation actions transition status atomically with audit log.

### Tests for User Story 11

- [x] T041 [P] [US11] Add contract tests for report and moderation endpoints in
      `api/tests/contract/map.moderation.contract.test.ts`
- [x] T042 [P] [US11] Add integration tests for pending_review withholding and
      admin approval payout in
      `api/tests/integration/map.moderation.integration.test.ts`

### Implementation for User Story 11

- [x] T043 [US11] Implement `POST /api/v1/map/features/:id/report` endpoint in
      `api/src/routes/map.ts`
- [x] T044 [US11] Implement moderator routes (`GET queue`, `POST moderate`) in
      `api/src/routes/adminMap.ts`
- [x] T045 [US11] Implement role guard middleware (`admin`/`map_moderator`) in
      `api/src/middleware/requireMapModerator.ts`
- [x] T046 [P] [US11] Implement moderation state machine and atomic
      status+ledger updates in `api/src/services/mapModerationService.ts`
- [x] T047 [P] [US11] Implement dispute-category instant escalation for
      trusted/senior users in `api/src/services/mapVerificationService.ts`
- [x] T048 [US11] Implement nightly abuse ring detector upsert job in
      `api/src/jobs/mapAbuseCheckJob.ts`
- [x] T048A [US11] Implement `GET /api/v1/map/stats/me` endpoint returning
      `rideImpactCount` and `trustTier` in `api/src/routes/map.ts`
- [x] T048B [P] [US11] Implement map stats aggregation service for
      `rideImpactCount` and `mapStreak` in `api/src/services/mapStatsService.ts`
- [x] T048C [P] [US11] Add contract tests for `GET /api/v1/map/stats/me`
      response fields in `api/tests/contract/map.stats.contract.test.ts`
- [x] T048D [US11] Add client query hook for map stats endpoint in
      `pkg/api-client/src/hooks/useMapStats.ts`

**Checkpoint**: US11 independently functional and testable.

---

## Phase 7: User Story 4 - Map Badges & Milestones (Priority: P2)

**Goal**: Award map badges idempotently for contribution and verification
milestones.

**Independent Test**: Badge worker awards map badges from map ledger/stats
signals independent of transport badges.

### Tests for User Story 4

- [x] T049 [P] [US4] Add badge evaluation unit tests for map milestones in
      `workers/src/__tests__/mapBadges.test.ts`
- [x] T050 [P] [US4] Add integration tests for idempotent `user_badge` writes in
      `api/tests/integration/map.badges.integration.test.ts`
- [x] T050A [P] [US4] Add integration tests for 7-day map streak bonus award
      idempotency in `api/tests/integration/map.streak.integration.test.ts`

### Implementation for User Story 4

- [x] T051 [US4] Seed map badge definitions for passenger/operator actor types
      in `pkg/db/seeds/mapBadges.ts`
- [x] T052 [US4] Extend badge evaluation pipeline for map milestones in
      `workers/src/processors/badgeProcessor.ts`
- [x] T053 [P] [US4] Implement map badge notification payload adapters in
      `pkg/notifications/src/templates/mapBadges.ts`
- [x] T054 [US4] Wire badge award side effects from map events in
      `workers/src/processors/gamificationProcessor.ts`
- [x] T054A [US4] Implement map streak progression and `MAP_POINTS_MAP_STREAK_7`
      bonus award (`streak_bonus`) in
      `workers/src/processors/gamificationProcessor.ts`

**Checkpoint**: US4 independently functional and testable.

---

## Phase 8: User Story 5 - Map Leaderboard (Priority: P2)

**Goal**: Monthly top-50 leaderboard with caller rank and archive rollover.

**Independent Test**: Redis sorted-set updates from map points are queryable
through leaderboard API independent of feature activation.

### Tests for User Story 5

- [x] T055 [P] [US5] Add contract tests for `GET /api/v1/map/leaderboard` in
      `api/tests/contract/map.leaderboard.contract.test.ts`
- [x] T056 [P] [US5] Add integration tests for monthly rollover and caller rank
      card in `api/tests/integration/map.leaderboard.integration.test.ts`

### Implementation for User Story 5

- [x] T057 [US5] Implement leaderboard score write-through from map points
      events in `workers/src/processors/gamificationProcessor.ts`
- [x] T058 [US5] Implement `GET /api/v1/map/leaderboard` endpoint in
      `api/src/routes/map.ts`
- [x] T059 [P] [US5] Implement leaderboard enrichment query (display name,
      counts) in `api/src/services/mapLeaderboardService.ts`
- [x] T060 [US5] Implement monthly leaderboard rollover/archive scheduler in
      `api/src/jobs/mapLeaderboardRolloverJob.ts`

**Checkpoint**: US5 independently functional and testable.

---

## Phase 9: User Story 7 - Passive Road Tracing (Priority: P2)

**Goal**: Opted-in driver trips produce processed road traces and capped points
for novel kilometers.

**Independent Test**: Completed trip with tracing enabled creates
`map_road_trace` record and capped points via worker without manual user action.

### Tests for User Story 7

- [x] T061 [P] [US7] Add worker unit tests for novel-km detection and daily cap
      in `workers/src/__tests__/mapRoadTraceProcessor.test.ts`
- [x] T062 [P] [US7] Add integration tests for opt-in/opt-out behavior on trip
      completion hook in
      `api/tests/integration/map.roadtrace.integration.test.ts`

### Implementation for User Story 7

- [x] T063 [US7] Publish trip-completed tracing job for opted-in drivers in
      `api/src/services/tripLifecycleService.ts`
- [x] T064 [US7] Implement road trace processor (RDP simplify + novel-km calc)
      in `workers/src/processors/mapRoadTraceProcessor.ts`
- [x] T065 [P] [US7] Persist processed traces and awarded points in
      `api/src/services/mapRoadTraceService.ts`
- [x] T066 [US7] Implement post-trip tracing toast notification dispatch in
      `pkg/notifications/src/templates/mapRoadTrace.ts`

**Checkpoint**: US7 independently functional and testable.

---

## Phase 10: User Story 8 - Weekly Map Missions (Priority: P2)

**Goal**: Weekly mission generation, per-user progress tracking, and completion
bonus.

**Independent Test**: User can complete 3 active missions in a week and receives
mission-complete bonus points.

### Tests for User Story 8

- [x] T067 [P] [US8] Add contract tests for mission endpoints in
      `api/tests/contract/map.missions.contract.test.ts`
- [x] T068 [P] [US8] Add integration tests for mission completion and expiry
      behavior in `api/tests/integration/map.missions.integration.test.ts`

### Implementation for User Story 8

- [x] T069 [US8] Implement weekly mission creation scheduler in
      `api/src/jobs/mapWeeklyMissionJob.ts`
- [x] T070 [US8] Implement mission progress updater on map actions in
      `api/src/services/mapMissionService.ts`
- [x] T071 [P] [US8] Implement mission endpoints (`GET /missions`,
      `GET /missions/me`) in `api/src/routes/map.ts`
- [x] T072 [US8] Implement mission completion/expiry notifications and bonus
      points dispatch in `workers/src/processors/mapMissionProcessor.ts`

**Checkpoint**: US8 independently functional and testable.

---

## Phase 11: User Story 6 - Browse & Filter Pending Contributions (Priority: P3)

**Goal**: Efficient pending-feature browsing with bbox/type/age filters and
swipe verification flow.

**Independent Test**: Pending endpoint returns paginated filtered records
without dependence on leaderboard/badges.

### Tests for User Story 6

- [x] T073 [P] [US6] Add contract tests for pending browse query params in
      `api/tests/contract/map.pendingBrowse.contract.test.ts`
- [x] T074 [P] [US6] Add integration tests for pagination, sort order, and
      filters in `api/tests/integration/map.pendingBrowse.integration.test.ts`

### Implementation for User Story 6

- [x] T075 [US6] Implement pending browse query service with bbox/type/age
      filters in `api/src/services/mapQueryService.ts`
- [x] T076 [P] [US6] Add map pending list and filter state hooks in
      `pkg/api-client/src/hooks/useMapPendingFeatures.ts`
- [x] T077 [P] [US6] Implement passenger app community map list/card flow in
      `apps/mobile/passenger/src/features/map/CommunityMapScreen.tsx`
- [x] T078 [US6] Implement driver app swipe-to-verify flow in
      `apps/mobile/driver/src/features/map/CommunityMapScreen.tsx`
- [x] T078A [P] [US6] Implement Rider Web Portal Explore and Map Fiji entry
      point in `apps/web/src/features/map/ExploreMapEntry.tsx`
- [x] T078B [US6] Wire rider web route and navigation for Explore and Map Fiji
      in `apps/web/src/router/index.tsx`
- [x] T078C [P] [US6] Add web integration test for entry-point visibility and
      navigation in
      `apps/web/src/features/map/__tests__/ExploreMapEntry.test.tsx`

**Checkpoint**: US6 independently functional and testable.

---

## Phase 12: User Story 9 - Neighbourhood Progress Map (Priority: P3)

**Goal**: Zone completion percentages, threshold notifications, and zone detail
with top contributors.

**Independent Test**: Feature activation updates zone counters and cached
percent independent of mission/tracing systems.

### Tests for User Story 9

- [x] T079 [P] [US9] Add integration tests for zone percentage updates and
      50/100% triggers in
      `api/tests/integration/map.zoneProgress.integration.test.ts`
- [x] T080 [P] [US9] Add contract tests for zone detail endpoint in
      `api/tests/contract/map.zone.contract.test.ts`

### Implementation for User Story 9

- [x] T081 [US9] Implement zone progress update handler on feature activation in
      `api/src/services/mapZoneService.ts`
- [x] T082 [P] [US9] Implement zone percentage cache updates in
      `api/src/services/mapRedisService.ts`
- [x] T083 [US9] Implement zone detail endpoint with top-3 contributors in
      `api/src/routes/map.ts`

**Checkpoint**: US9 independently functional and testable.

---

## Phase 13: User Story 10 - First Discoverer Bonus (Priority: P3)

**Goal**: Award pioneer bonus and explorer progression based on first activation
in zone.

**Independent Test**: Transitioning a zone from 0 to 1 active feature awards
pioneer bonus exactly once in race-safe manner.

### Tests for User Story 10

- [x] T084 [P] [US10] Add concurrency tests for race-safe pioneer award in
      `api/tests/integration/map.pioneer.concurrency.test.ts`
- [x] T085 [P] [US10] Add integration tests for explorer badge after 3 pioneered
      zones in `api/tests/integration/map.pioneer.integration.test.ts`

### Implementation for User Story 10

- [x] T086 [US10] Implement pioneer award logic on atomic zone increment in
      `api/src/services/mapZoneService.ts`
- [x] T087 [P] [US10] Implement pioneer/explorer badge trigger plumbing in
      `workers/src/processors/badgeProcessor.ts`
- [x] T088 [US10] Implement pioneer label visibility rules for zone detail cards
      in `api/src/services/mapZoneService.ts`

**Checkpoint**: US10 independently functional and testable.

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, documentation, performance checks, and end-to-end
validation.

- [x] T089 [P] Add end-to-end map feature happy-path test (submit -> verify ->
      activate) in `api/tests/e2e/map.happyPath.e2e.test.ts`
- [x] T090 [P] Add load/perf benchmarks for submit and pending endpoints in
      `api/tests/perf/map.perf.test.ts`
- [x] T091 Add OpenAPI/request docs and response examples for map APIs in
      `api/docs/map-api.md`
- [x] T092 Add quickstart verification updates and command list in
      `specs/009-hakwa-maps-crowdsourcing/quickstart.md`
- [x] T093 Add operational runbook (jobs, Redis keys, moderation workflow) in
      `docs/runbooks/map-crowdsourcing.md`
- [x] T094 Run full validation checklist and capture completion status in
      `specs/009-hakwa-maps-crowdsourcing/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **P1 stories**: US1, US2, US3, US11 after Phase 2.
- **P2 stories**: US4, US5, US7, US8 after required P1 interfaces are stable.
- **P3 stories**: US6, US9, US10 after base map APIs and zone services are
  available.
- **Phase 14 (Polish)**: After selected story scope is complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on foundational phase.
- **US2 (P1)**: Depends on US1 feature creation API and pending query surface.
- **US3 (P1)**: Depends on US2 vote writes.
- **US11 (P1)**: Depends on US1 submission flow and core moderation schema.
- **US4 (P2)**: Depends on US1/US2/US3 map events and contributor stats.
- **US5 (P2)**: Depends on US1/US2/US3 points events.
- **US7 (P2)**: Depends on foundational worker plumbing and trip lifecycle
  hooks.
- **US8 (P2)**: Depends on core map action events from US1/US2.
- **US6 (P3)**: Depends on US1 pending endpoint and US2 verification endpoint.
- **US9 (P3)**: Depends on US3 activation and zone updates.
- **US10 (P3)**: Depends on US9 zone counting and US3 activation events.

### Within Each User Story

- Tests first (must fail before implementation).
- API contract and validation before UI integration.
- Service logic before scheduler/notification side effects.
- Concurrency-sensitive transitions before feature completion sign-off.

---

## Parallel Opportunities

- Setup tasks marked `[P]` can run concurrently (`T002`-`T009` except
  dependency-ordered schema work).
- Foundational tasks marked `[P]` (`T011`, `T012`, `T015`, `T016`) can run in
  parallel once table scaffolding begins.
- Within each user story, test tasks and isolated client/server tasks marked
  `[P]` can execute concurrently.

### Parallel Example: User Story 1

- Run `T019` and `T020` in parallel while API shape stabilizes.
- Run `T023` and `T024` in parallel after `T021` route scaffold is created.

### Parallel Example: User Story 2

- Run `T027` and `T028` in parallel.
- Run `T031` and `T032` in parallel after `T029` endpoint contract is fixed.

### Parallel Example: User Story 3

- Run `T034` and `T035` in parallel.
- Run `T037` and `T038` in parallel after `T036` transition logic is merged.

### Parallel Example: User Story 11

- Run `T041` and `T042` in parallel.
- Run `T046` and `T047` in parallel after `T044` moderator route contracts
  exist.

### Parallel Example: User Story 4

- Run `T049` and `T050` in parallel.
- Run `T053` and `T054` in parallel after `T052` milestone checks are in place.

### Parallel Example: User Story 5

- Run `T055` and `T056` in parallel.
- Run `T058` and `T059` in parallel once Redis score writes (`T057`) are
  available.

### Parallel Example: User Story 7

- Run `T061` and `T062` in parallel.
- Run `T065` and `T066` in parallel after worker processor (`T064`) exists.

### Parallel Example: User Story 8

- Run `T067` and `T068` in parallel.
- Run `T071` and `T072` in parallel after mission progress service (`T070`) is
  in place.

### Parallel Example: User Story 6

- Run `T073` and `T074` in parallel.
- Run `T076` and `T077` in parallel after pending query service (`T075`) is
  merged.

### Parallel Example: User Story 9

- Run `T079` and `T080` in parallel.
- Run `T082` and `T083` in parallel after core zone progression (`T081`) is
  merged.

### Parallel Example: User Story 10

- Run `T084` and `T085` in parallel.
- Run `T087` and `T088` in parallel after pioneer core logic (`T086`) is
  complete.

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2.
2. Complete US1 (Phase 3).
3. Validate independent US1 test criteria and demo contribution flow.

### Priority Delivery

1. Deliver P1 set: US1 -> US2 -> US3 -> US11.
2. Deliver P2 set: US4 -> US5 -> US7 -> US8.
3. Deliver P3 set: US6 -> US9 -> US10.
4. Finish Phase 14 hardening and runbook work.

### Team Parallelization

1. Team A: Core API lifecycle (US1-US3).
2. Team B: Safety/moderation track (US11).
3. Team C: Gamification/leaderboard/missions (US4-US5-US8).
4. Team D: Client UX and zone/pioneer experiences (US6-US9-US10).

---

## Notes

- All tasks follow strict checklist format: checkbox, task ID, optional `[P]`,
  required story label for story phases, and explicit file path.
- Story phases are independently testable by design.
- Keep all cross-package contracts centralized in shared workspace packages.
