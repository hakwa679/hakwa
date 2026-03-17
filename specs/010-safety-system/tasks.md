---
description: "Task list for Rider & Driver Safety System"
---

# Tasks: Rider & Driver Safety System

**Input**: Design documents from `specs/010-safety-system/` **Prerequisites**:
`plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`,
`contracts/rest-api.md`, `quickstart.md`

**Tests**: Automated tests are required by this feature's checklist. Include
contract, integration, and targeted performance/security checks.

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel (different files, no dependency on
  unfinished tasks)
- **[Story]**: User story label (`[US1]` ... `[US7]`) for story-phase tasks only
- Every task includes an explicit file path

---

## Phase 1: Setup (Schema + Contracts Scaffold)

**Purpose**: Create safety schema baseline and route/test scaffolding shared by
all stories.

- [x] T001 Create `safetyIncident`, `safetyContact`, `tripShare`, and
      `safetyCheckIn` tables in `pkg/db/schema/safety.ts`
- [x] T002 [P] Extend merchant status enum with `suspended_pending_review` in
      `pkg/db/schema/merchant.ts`
- [x] T003 [P] Export safety schema in `pkg/db/schema/index.ts`
- [x] T004 Create initial migration snapshot and validate schema push script in
      `pkg/db/drizzle.config.ts`
- [x] T005 Add safety API router scaffold with TODO handlers in
      `api/src/routes/safety.ts`
- [x] T006 [P] Add safety admin router scaffold in
      `api/src/routes/admin/safety.ts`
- [x] T007 Wire safety router mounts in `api/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement cross-story infrastructure for auth, SMS outbox,
websocket events, env validation, and shared utilities.

**CRITICAL**: No user story implementation starts until this phase is done.

- [x] T008 Implement shared safety error codes and messages in
      `errors/src/codes.ts`
- [x] T009 [P] Export safety error helpers through package barrel in
      `errors/index.ts`
- [x] T010 Implement safety reference code generator utility in
      `core/src/safety/reference-code.ts`
- [x] T011 [P] Implement E.164 phone normalization utility with Fiji defaults in
      `core/src/safety/phone-normalize.ts`
- [x] T012 [P] Implement safety WebSocket event publisher helper in
      `api/src/services/safetyEvents.ts`
- [x] T013 Implement Twilio SMS adapter with retry metadata in
      `notifications/src/adapters/twilio.ts`
- [x] T014 Implement Redis Stream SMS worker (`safety:sms:outbox`) in
      `api/src/workers/smsSender.ts`
- [x] T015 Implement pending check-in escalation worker loop in
      `api/src/workers/checkInEscalation.ts`
- [x] T016 Register safety workers and pub/sub subscriptions in
      `api/src/index.ts`
- [x] T017 Add `SAFETY_CODE_SECRET` and Twilio env validation at startup in
      `api/src/config/env.ts`
- [x] T018 Add foundational integration test for SMS outbox enqueue/dequeue path
      in `api/tests/integration/safety.outbox.integration.test.ts`

**Checkpoint**: Foundational safety infrastructure ready; user stories can
proceed.

---

## Phase 3: User Story 1 - Trigger SOS During Active Trip (Priority: P1) 🎯 MVP

**Goal**: Allow passenger or driver to trigger SOS with deduplication, async SMS
fan-out, and safety-team event dispatch.

**Independent Test**: `POST /api/v1/safety/sos` creates one active incident,
queues SMS, emits websocket event, and deduplicates repeats within 60 seconds.

### Tests for User Story 1

- [x] T019 [P] [US1] Add contract test for `POST /safety/sos` in
      `api/tests/contract/safety.sos.contract.test.ts`
- [x] T020 [P] [US1] Add integration test for SOS creation + outbox enqueue in
      `api/tests/integration/safety.sos.integration.test.ts`
- [x] T021 [P] [US1] Add integration test for SOS dedup key TTL behavior in
      `api/tests/integration/safety.sos-dedup.integration.test.ts`
- [x] T022 [P] [US1] Add websocket event assertion test for
      `safety.sos_triggered` in
      `api/tests/integration/safety.sos-websocket.integration.test.ts`
- [x] T091 [P] [US1] Add integration test for `safety.check_in_escalated` and
      `safety.critical_incident` websocket emissions in
      `api/tests/integration/safety.events.integration.test.ts`

### Implementation for User Story 1

- [x] T023 [US1] Implement `triggerSOS` domain flow in
      `api/src/services/safetyService.ts`
- [x] T024 [P] [US1] Implement `POST /safety/sos` endpoint handler in
      `api/src/routes/safety.ts`
- [x] T025 [P] [US1] Implement Redis dedup key `safety:sos_dedup:<tripId>` with
      60s TTL in `api/src/services/safetyService.ts`
- [x] T026 [P] [US1] Implement rider long-press SOS countdown UI in
      `apps/mobile/passenger/src/screens/ActiveTrip/SafetyPanel.tsx`
- [x] T027 [P] [US1] Implement rider silent SOS volume-button trigger hook in
      `apps/mobile/passenger/src/hooks/useSilentSOS.ts`
- [x] T028 [P] [US1] Implement driver SOS parity UI and silent trigger in
      `apps/mobile/driver/src/screens/ActiveTrip/SafetyPanel.tsx`

**Checkpoint**: US1 works independently with automated tests passing.

---

## Phase 4: User Story 2 - Share Live Trip with Trusted Contact (Priority: P1)

**Goal**: Generate/revoke public share links and stream location updates via SSE
without authentication.

**Independent Test**: A passenger creates a share link, viewer accesses
`GET /safety/share/:token` and receives live-safe data, SSE updates every <=5s,
revoked/expired links return 410.

### Tests for User Story 2

- [x] T029 [P] [US2] Add contract tests for share create/revoke/public read
      endpoints in `api/tests/contract/safety.share.contract.test.ts`
- [x] T030 [P] [US2] Add integration test for token creation entropy and
      active-share rotation in
      `api/tests/integration/safety.share-token.integration.test.ts`
- [x] T031 [P] [US2] Add integration test for `410 SAFETY_SHARE_EXPIRED`
      lifecycle in
      `api/tests/integration/safety.share-expiry.integration.test.ts`
- [x] T032 [P] [US2] Add SSE integration test for location events and close
      semantics in `api/tests/integration/safety.share-sse.integration.test.ts`
- [x] T033 [P] [US2] Add security test ensuring token not present in error
      body/log payloads in
      `api/tests/integration/safety.share-security.integration.test.ts`

### Implementation for User Story 2

- [x] T034 [US2] Implement create/revoke/share lookup service methods in
      `api/src/services/safetyShareService.ts`
- [x] T035 [P] [US2] Implement `POST /safety/trips/:tripId/share` in
      `api/src/routes/safety.ts`
- [x] T036 [P] [US2] Implement `DELETE /safety/trips/:tripId/share` in
      `api/src/routes/safety.ts`
- [x] T037 [P] [US2] Implement public `GET /safety/share/:token` response
      shaping in `api/src/routes/safety.ts`
- [x] T038 [P] [US2] Implement `GET /safety/share/:token/stream` SSE endpoint in
      `api/src/routes/safety.ts`
- [x] T039 [P] [US2] Implement share expiry updater job in
      `api/src/jobs/tripShareExpiry.ts`
- [x] T040 [P] [US2] Implement passenger app share/revoke UI actions in
      `apps/mobile/passenger/src/screens/ActiveTrip/TripShareCard.tsx`

**Checkpoint**: US2 is independently testable and deployable.

---

## Phase 5: User Story 3 - Verify Vehicle Before Boarding (Priority: P1)

**Goal**: Deterministic 4-digit safety code and wrong-vehicle reporting
workflow.

**Independent Test**: Passenger and driver see same deterministic code for a
trip/day, and wrong-vehicle report creates an incident with immediate suspension
workflow.

### Tests for User Story 3

- [x] T041 [P] [US3] Add unit test for HMAC safety-code generation and date
      rotation in `core/src/safety/reference-code.test.ts`
- [x] T042 [P] [US3] Add contract tests for verify and wrong-vehicle endpoints
      in `api/tests/contract/safety.verify.contract.test.ts`
- [x] T043 [P] [US3] Add integration test for wrong-vehicle -> incident +
      suspension transaction in
      `api/tests/integration/safety.wrong-vehicle.integration.test.ts`

### Implementation for User Story 3

- [x] T044 [US3] Implement deterministic safety-code helper in
      `core/src/safety/safety-code.ts`
- [x] T045 [P] [US3] Implement `GET /safety/trips/:tripId/verify` in
      `api/src/routes/safety.ts`
- [x] T046 [P] [US3] Implement `POST /safety/trips/:tripId/wrong-vehicle` in
      `api/src/routes/safety.ts`
- [x] T047 [P] [US3] Implement passenger verify-plate full-screen UI in
      `apps/mobile/passenger/src/screens/ActiveTrip/VehicleVerifyCard.tsx`
- [x] T048 [P] [US3] Implement driver mirrored safety-code display in
      `apps/mobile/driver/src/screens/ActiveTrip/VehicleVerifyCard.tsx`

**Checkpoint**: US3 complete with deterministic cross-app verification.

---

## Phase 6: User Story 4 - Manage Emergency Contacts (Priority: P1)

**Goal**: Users can add/list/delete up to 3 contacts and trigger test alerts.

**Independent Test**: Contact CRUD respects ownership and max limit; test-alert
queues SMS and does not create incidents.

### Tests for User Story 4

- [x] T049 [P] [US4] Add contract tests for contacts CRUD and test-alert in
      `api/tests/contract/safety.contacts.contract.test.ts`
- [x] T050 [P] [US4] Add integration test for E.164 normalization and
      contact-limit enforcement in
      `api/tests/integration/safety.contacts.integration.test.ts`
- [x] T051 [P] [US4] Add integration test asserting test-alert does not insert
      `safetyIncident` in
      `api/tests/integration/safety.test-alert.integration.test.ts`

### Implementation for User Story 4

- [x] T052 [US4] Implement contacts service (list/add/delete/test-alert) in
      `api/src/services/safetyContactsService.ts`
- [x] T053 [P] [US4] Implement `GET|POST|DELETE /safety/contacts*` routes in
      `api/src/routes/safety.ts`
- [x] T054 [P] [US4] Implement one-time onboarding nudge persistence logic in
      `apps/mobile/passenger/src/screens/Settings/EmergencyContactsScreen.tsx`
- [x] T055 [P] [US4] Implement passenger emergency contacts management UI in
      `apps/mobile/passenger/src/screens/Settings/EmergencyContactsScreen.tsx`
- [x] T056 [P] [US4] Implement driver emergency contacts management UI in
      `apps/mobile/driver/src/screens/Settings/EmergencyContactsScreen.tsx`

**Checkpoint**: US4 complete; SOS recipients can be managed end-to-end.

---

## Phase 7: User Story 5 - Automated In-Trip Safety Check-ins (Priority: P2)

**Goal**: Detect anomaly thresholds and enforce 90-second check-in escalation
flow.

**Independent Test**: Injected telemetry triggers one check-in per cooldown
window and escalates if unanswered.

### Tests for User Story 5

- [x] T057 [P] [US5] Add integration test for route-deviation threshold logic in
      `api/tests/integration/safety.route-deviation.integration.test.ts`
- [x] T058 [P] [US5] Add integration test for prolonged-stop and speed anomalies
      in `api/tests/integration/safety.anomalies.integration.test.ts`
- [x] T059 [P] [US5] Add integration test for 20-minute anomaly cooldown key in
      `api/tests/integration/safety.cooldown.integration.test.ts`
- [x] T060 [P] [US5] Add integration test for escalation at 90 seconds +
      incident creation in
      `api/tests/integration/safety.checkin-escalation.integration.test.ts`
- [x] T061 [P] [US5] Add contract test for
      `POST /safety/check-ins/:checkInId/respond` in
      `api/tests/contract/safety.checkin-respond.contract.test.ts`

### Implementation for User Story 5

- [x] T062 [US5] Implement anomaly detector service (route/stop/speed) in
      `api/src/services/safetyAnomalyService.ts`
- [x] T063 [P] [US5] Integrate anomaly checks into telemetry flow in
      `api/src/services/locationService.ts`
- [x] T064 [P] [US5] Implement check-in creation/respond domain logic in
      `api/src/services/safetyCheckInService.ts`
- [x] T065 [P] [US5] Implement check-in response endpoint in
      `api/src/routes/safety.ts`
- [x] T066 [P] [US5] Implement passenger check-in prompt modal and countdown in
      `apps/mobile/passenger/src/screens/ActiveTrip/SafetyCheckInModal.tsx`

**Checkpoint**: US5 anomaly detection and escalation are fully functional.

---

## Phase 8: User Story 6 - Report a Safety Incident (Priority: P2)

**Goal**: Allow formal reports with optional evidence and critical-category
auto-suspension.

**Independent Test**: Critical categories atomically suspend merchant while
creating incident; non-critical reports stay open without suspension.

### Tests for User Story 6

- [x] T067 [P] [US6] Add contract test for `POST /safety/incidents/report` in
      `api/tests/contract/safety.report.contract.test.ts`
- [x] T068 [P] [US6] Add integration test for critical-category transaction
      semantics in
      `api/tests/integration/safety.report-critical.integration.test.ts`
- [x] T069 [P] [US6] Add integration test for non-critical report behavior in
      `api/tests/integration/safety.report-noncritical.integration.test.ts`
- [x] T070 [P] [US6] Add integration test for evidence MIME and size validation
      in `api/tests/integration/safety.evidence.integration.test.ts`
- [x] T093 [P] [US6] Add integration test validating randomized evidence storage
      key generation and raw filename stripping in
      `api/tests/integration/safety.evidence-storage.integration.test.ts`

### Implementation for User Story 6

- [x] T071 [US6] Implement incident report domain service with transaction
      boundaries in `api/src/services/safetyIncidentService.ts`
- [x] T072 [P] [US6] Implement `POST /safety/incidents/report` endpoint in
      `api/src/routes/safety.ts`
- [x] T073 [P] [US6] Implement evidence upload request validation endpoint in
      `api/src/routes/safety.ts`
- [x] T092 [P] [US6] Implement non-guessable evidence storage key generation and
      raw filename stripping in `api/src/services/safetyIncidentService.ts`
- [x] T074 [P] [US6] Implement safety report form UI in
      `apps/mobile/passenger/src/screens/SafetyReportScreen.tsx`
- [x] T075 [P] [US6] Implement reporter notification on incident resolution in
      `api/src/services/safetyIncidentService.ts`

**Checkpoint**: US6 reporting and critical handling pipeline complete.

---

## Phase 9: User Story 7 - View Safety History and Follow-Up (Priority: P3)

**Goal**: Provide authenticated, paginated, own-record-only safety history.

**Independent Test**: `GET /safety/history` returns only caller-owned
incidents/check-ins with correct pagination and resolution mapping.

### Tests for User Story 7

- [x] T076 [P] [US7] Add contract test for `GET /safety/history` pagination in
      `api/tests/contract/safety.history.contract.test.ts`
- [x] T077 [P] [US7] Add integration test for cross-user access isolation in
      `api/tests/integration/safety.history-security.integration.test.ts`

### Implementation for User Story 7

- [x] T078 [US7] Implement history query and DTO mapping service in
      `api/src/services/safetyHistoryService.ts`
- [x] T079 [P] [US7] Implement `GET /safety/history` endpoint in
      `api/src/routes/safety.ts`
- [x] T080 [P] [US7] Implement safety history screen in
      `apps/mobile/passenger/src/screens/SafetyHistoryScreen.tsx`
- [x] T081 [P] [US7] Implement safety history screen in
      `apps/mobile/driver/src/screens/SafetyHistoryScreen.tsx`

**Checkpoint**: US7 transparent history and follow-up workflow complete.

---

## Phase 10: Admin Safety Queue and Operations

**Purpose**: Safety-team triage and resolution workflow for operational
readiness.

- [x] T082 Implement `GET /admin/safety/incidents` queue endpoint in
      `api/src/routes/admin/safety.ts`
- [x] T083 [P] Implement `PATCH /admin/safety/incidents/:id` resolution endpoint
      in `api/src/routes/admin/safety.ts`
- [x] T084 [P] Add integration test for admin incident status transitions in
      `api/tests/integration/safety.admin-queue.integration.test.ts`

---

## Final Phase: Polish and Cross-Cutting Concerns

- [x] T085 [P] Add rate limiting for SOS and test-alert endpoints in
      `api/src/middleware/rateLimit.ts`
- [x] T086 [P] Add redaction guard for share tokens in request/error logging in
      `api/src/middleware/requestLogger.ts`
- [x] T087 [P] Add end-to-end checklist alignment tests for success criteria
      SC-001..SC-008 in `api/tests/e2e/safety.success-criteria.e2e.test.ts`
- [x] T088 [P] Add latency/performance test for SOS and SSE timing budgets in
      `api/tests/perf/safety.latency.perf.test.ts`
- [x] T089 [P] Update feature runbook and operational alerts in
      `docs/runbooks/safety-system.md`
- [x] T090 Run quickstart verification scenarios and document observed outputs
      in `specs/010-safety-system/quickstart.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- Phase 1 -> Phase 2 -> User Story phases (Phase 3 onward)
- Phase 10 depends on US1 and US6 incident workflows
- Final phase depends on all story phases targeted for release

### User Story Dependencies

- US1 depends on Phase 2 (SMS/websocket foundation)
- US2 depends on Phase 2 (token, SSE, logging safeguards)
- US3 depends on Phase 2 (secret/env and reference utilities)
- US4 depends on Phase 2 (phone normalization, outbox)
- US5 depends on Phase 2 and benefits from US4 contacts for escalation dispatch
- US6 depends on Phase 1 schema and Phase 2 errors/events
- US7 depends on US1/US5/US6 data existing

---

## Parallel Opportunities

- Phase 1: T002, T003, T006 can run in parallel
- Phase 2: T009, T011, T012, T013 can run in parallel
- US1 tests T019-T022 plus T091 can run in parallel; UI tasks T026-T028 can run
  in parallel
- US2 tests T029-T033 can run in parallel; route handlers T035-T038 can run in
  parallel
- US3 tests T041-T043 can run in parallel; UI tasks T047-T048 can run in
  parallel
- US4 tests T049-T051 can run in parallel; mobile UI tasks T055-T056 can run in
  parallel
- US5 tests T057-T061 can run in parallel; service tasks T063-T066 can run in
  parallel
- US6 tests T067-T070 plus T093 can run in parallel; implementation tasks
  T072-T075 plus T092 can run in parallel
- US7 tasks T080-T081 can run in parallel
- Final phase tasks T085-T089 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Parallel tests
T019 api/tests/contract/safety.sos.contract.test.ts
T020 api/tests/integration/safety.sos.integration.test.ts
T021 api/tests/integration/safety.sos-dedup.integration.test.ts
T022 api/tests/integration/safety.sos-websocket.integration.test.ts

# Parallel implementation tasks
T026 apps/mobile/passenger/src/screens/ActiveTrip/SafetyPanel.tsx
T027 apps/mobile/passenger/src/hooks/useSilentSOS.ts
T028 apps/mobile/driver/src/screens/ActiveTrip/SafetyPanel.tsx
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2
2. Complete US1 and US4 (core SOS + contact recipients)
3. Validate SOS timing and dedup acceptance criteria

### Incremental Delivery

1. Add US2 and US3 next (preventive safety layers)
2. Add US5 and US6 (automated safety + formal reporting)
3. Add US7 and Admin queue
4. Finish polish/perf/security hardening

### Suggested MVP Scope

- T001-T028 plus T052-T056

---

## Validation Summary

- Total tasks: 93
- User story task counts: - US1: 11 tasks - US2: 12 tasks - US3: 8 tasks - US4:
  8 tasks - US5: 10 tasks - US6: 11 tasks - US7: 6 tasks
- Parallelizable tasks (`[P]`): 72
- Format validation: all tasks use
  `- [ ] T### [P?] [US?] Description with file path`
