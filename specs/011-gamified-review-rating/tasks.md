---
description: "Task list for Gamified Review & Rating System"
---

# Tasks: Gamified Review & Rating System

**Input**: Design documents from `specs/011-gamified-review-rating/`  
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`,
`data-model.md`, `contracts/rest-api.md`

**Tests**: Included because spec success criteria explicitly require automated
validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependency)
- **[Story]**: User story label (`[US1]` ... `[US11]`) for story-phase tasks
- Each task includes an explicit file path

---

## Phase 1: Setup (Schema + Contract Baseline)

**Purpose**: Establish schema, constraints, and seeds required by all stories.

- [x] T001 Add `completedAt` column to `trip` schema and completion write-path
      in `pkg/db/schema/trip.ts` and `api/src/services/tripService.ts`
- [x] T002 [P] Create review tables (`reviewTag`, `tripReview`, `tripReviewTag`)
      with indexes and constraints in `pkg/db/schema/review.ts`
- [x] T003 [P] Add points idempotency constraint
      `UNIQUE(accountId, sourceAction, referenceId)` in
      `pkg/db/schema/gamification.ts`
- [x] T004 Export review schema from `pkg/db/schema/index.ts` and run schema
      apply workflow via `pkg/db/package.json` scripts
- [x] T005 [P] Implement and wire review tag seeding job in
      `api/src/jobs/seedReviewTags.ts` and `api/src/index.ts`
- [x] T006 Align shared request/response and enum contracts for reviews in
      `types/src/` and `types/index.ts`
- [x] T062 [P] Initialize/confirm shared mobile review module scaffold in
      `pkg/ui-native/src/review/` and export entrypoints from
      `pkg/ui-native/src/index.ts` for reuse across rider/driver apps

---

## Phase 2: Foundational (Core Review + Reveal + Points)

**Purpose**: Build blocking service layer used by every user story.

**CRITICAL**: No user-story work starts before this phase is complete.

- [x] T007 Implement points calculator (`10/15/25`) and comment/tag
      normalization helpers in `api/src/services/reviewService.ts`
- [x] T008 [P] Implement double-blind reveal evaluator (computed-at-read, no
      persisted flag) in `api/src/services/reviewService.ts`
- [x] T009 [P] Implement direction/window validation (72h passenger, 24h driver)
      in `api/src/services/reviewService.ts`
- [x] T010 Implement transactional `submitReview` flow with idempotent ledger
      write and review-tag inserts in `api/src/services/reviewService.ts`
- [x] T011 [P] Publish post-commit gamification and reveal events
      (`gamification:events`, `review:revealed:{userId}`) in
      `api/src/services/reviewService.ts`
- [x] T012 Register review error codes/envelopes in `errors/src/` and
      `errors/index.ts`

**Checkpoint**: Core review submission, points, and reveal logic are stable.

---

## Phase 3: User Story 1 - Passenger reviews driver (Priority: P1) 🎯 MVP

**Goal**: Passenger can submit post-trip review and receive immediate reward
feedback.

**Independent Test**: Completed trip for passenger shows review card and
successful submit creates one `tripReview` row plus one `pointsLedger` entry.

- [x] T013 [P] [US1] Add contract test for passenger review submission in
      `api/tests/contract/reviews.passenger-submit.contract.test.ts`
- [x] T014 [P] [US1] Add integration test for passenger review flow in
      `api/tests/integration/reviews.passenger-submit.integration.test.ts`
- [x] T015 [US1] Implement passenger review submit route handler in
      `api/src/routes/reviews.ts` for `POST /reviews` (contract-aligned)
- [x] T061 [US1] Extract shared review-flow logic (step state, points preview,
      validation) into a reusable mobile module in `pkg/ui-native/src/review/`
      before mirroring rider/driver screens
- [x] T016 [P] [US1] Implement rider review card screen flow in
      `apps/mobile/rider/src/screens/TripComplete/ReviewCard.tsx`
- [x] T017 [US1] Implement rider celebration and points feedback UI state in
      `apps/mobile/rider/src/screens/TripComplete/ReviewCard.tsx`

---

## Phase 4: User Story 2 - Driver reviews passenger (Priority: P1)

**Goal**: Driver can submit passenger review within driver window.

**Independent Test**: Driver can submit `driver_to_passenger` review and award
path uses same transactional rules.

- [x] T018 [P] [US2] Add contract test for driver review submission in
      `api/tests/contract/reviews.driver-submit.contract.test.ts`
- [x] T019 [P] [US2] Add integration test for driver review flow in
      `api/tests/integration/reviews.driver-submit.integration.test.ts`
- [x] T020 [US2] Implement driver review submit path in
      `api/src/routes/reviews.ts` for `POST /reviews` driver direction
- [x] T021 [P] [US2] Implement driver review card screen flow in
      `apps/mobile/driver/src/screens/TripComplete/ReviewCard.tsx`

---

## Phase 5: User Story 3 - Stepwise review flow (Priority: P1)

**Goal**: Three-step UX (stars -> tags -> comment) with live progression.

**Independent Test**: Step transition and validation rules operate without
server changes.

- [x] T022 [P] [US3] Add UI test for step advancement and validation rules in
      `apps/mobile/rider/src/screens/TripComplete/ReviewCard.test.tsx`
- [x] T023 [P] [US3] Implement tag loading/filtering endpoint for step 2 in
      `api/src/routes/reviews.ts` for `GET /reviews/tags`
- [x] T024 [US3] Implement live step and input constraints in rider review card
      in `apps/mobile/rider/src/screens/TripComplete/ReviewCard.tsx`
- [x] T025 [US3] Mirror step constraints in driver review card in
      `apps/mobile/driver/src/screens/TripComplete/ReviewCard.tsx`

---

## Phase 6: User Story 4 - Points & bonus calculation (Priority: P1)

**Goal**: Persisted `pointsAwarded` exactly matches visible point schedule.

**Independent Test**: Automated cases validate 10/15/25 outcomes and edge cases.

- [x] T026 [P] [US4] Add unit tests for points calculator and normalization in
      `api/tests/unit/reviews.points.unit.test.ts`
- [x] T027 [P] [US4] Add integration tests for points+ledger atomicity in
      `api/tests/integration/reviews.points.integration.test.ts`
- [x] T028 [US4] Expose points breakdown in submit response contract in
      `api/src/routes/reviews.ts` and `types/src/`

---

## Phase 7: User Story 5 - Double-blind reveal (Priority: P1)

**Goal**: Review visibility follows counterpart-submit or counterpart-expiry
rules.

**Independent Test**: Hidden review remains omitted until reveal condition is
met; reveal event triggers updates.

- [x] T029 [P] [US5] Add contract tests for reveal filtering in
      `api/tests/contract/reviews.reveal.contract.test.ts`
- [x] T030 [P] [US5] Add integration tests for counterpart submit/expiry
      scenarios in `api/tests/integration/reviews.reveal.integration.test.ts`
- [x] T031 [US5] Implement trip-review read endpoint with computed reveal
      filtering in `api/src/routes/reviews.ts` for `GET /reviews/trip/:tripId`
- [x] T032 [P] [US5] Wire `review:revealed` fan-out in websocket layer in
      `api/src/websocket.ts`
- [x] T033 [US5] Handle reveal update event in rider and driver apps in
      `apps/mobile/rider/src/` and `apps/mobile/driver/src/`

---

## Phase 8: User Story 6 - Reviewer badges (Priority: P2)

**Goal**: Reviewer achievement badges are awarded idempotently after review
submission.

**Independent Test**: Badge conditions evaluate from review history and never
duplicate grants.

- [x] T034 [P] [US6] Add badge seed entries for reviewer achievements in
      `pkg/db/seeds/` and `pkg/db/schema/gamification.ts`
- [x] T035 [P] [US6] Add worker tests for reviewer badge triggers in
      `pkg/workers/src/__tests__/reviewerBadges.test.ts`
- [x] T036 [US6] Implement reviewer badge evaluation in
      `pkg/workers/src/workers/gamificationProcessor.ts`

---

## Phase 9: User Story 7 - Reputation display on profiles (Priority: P2)

**Goal**: Profile reputation aggregates show revealed-only review insights.

**Independent Test**: Driver and passenger profile payloads show correct
aggregates and fallback behavior.

- [x] T037 [P] [US7] Add contract tests for reputation payloads in
      `api/tests/contract/reviews.reputation.contract.test.ts`
- [x] T038 [P] [US7] Implement reputation aggregate query and Redis cache in
      `api/src/services/reviewService.ts`
- [x] T039 [US7] Implement public reputation route in
      `api/src/routes/reviews.ts` for `GET /reviews/user/:userId`
- [x] T063 [US7] Implement authenticated self-reputation route in
      `api/src/routes/reviews.ts` for `GET /reviews/me`
- [x] T040 [P] [US7] Invalidate `reputation:{userId}` cache on new reveal in
      `api/src/services/reviewService.ts`
- [x] T064 [US7] Implement passenger signal route in `api/src/routes/reviews.ts`
      for `GET /reviews/passenger-signal/:userId`
- [x] T041 [US7] Add passenger rating signal in booking request payload in
      `api/src/services/bookingService.ts` using
      `GET /reviews/passenger-signal/:userId`
- [x] T065 [US7] Implement driver signal route in `api/src/routes/reviews.ts`
      for `GET /reviews/driver-signal/:userId`
- [x] T042 [US7] Add driver rating signal in rider matching payload in
      `api/src/services/matchingService.ts` and document/implement
      `GET /reviews/driver-signal/:userId` contract

---

## Phase 10: User Story 8 - Driver reputation dashboard (Priority: P2)

**Goal**: Driver-specific dashboard includes history, tag insights, and
annotations.

**Independent Test**: Dashboard shows 6-month series, top tags, and negative-tag
annotations.

- [x] T043 [P] [US8] Add contract tests for dashboard payload in
      `api/tests/contract/reviews.dashboard.contract.test.ts`
- [x] T044 [P] [US8] Implement dashboard aggregates in review service in
      `api/src/services/reviewService.ts`
- [x] T045 [US8] Implement driver dashboard route in `api/src/routes/reviews.ts`
      for `GET /reviews/me/dashboard`
- [x] T046 [US8] Add annotation builder for negative tag patterns in
      `api/src/services/reviewService.ts`

---

## Phase 11: User Story 9 - Reputation badges (Priority: P2)

**Goal**: Reputation badges award and revoke based on visible-review metrics.

**Independent Test**: Crossing thresholds grants badges; dropping below
thresholds revokes them.

- [x] T047 [P] [US9] Add worker tests for reputation badge award/revoke in
      `pkg/workers/src/__tests__/reputationBadges.test.ts`
- [x] T048 [US9] Implement reputation badge evaluation/revocation in
      `pkg/workers/src/workers/gamificationProcessor.ts`
- [x] T049 [US9] Add revocation notification event emission in
      `pkg/workers/src/workers/gamificationProcessor.ts`

---

## Phase 12: User Story 10 - Weekly review mission (Priority: P3)

**Goal**: Weekly mission tracks review count and awards one-time weekly bonus.

**Independent Test**: Third review in week grants exactly one 50-point bonus;
week rollover resets mission.

- [x] T050 [P] [US10] Add mission-progress tests and idempotency cases in
      `pkg/workers/src/__tests__/weeklyReviewMission.test.ts`
- [x] T051 [US10] Implement mission progress tracking and bonus award in
      `pkg/workers/src/workers/gamificationProcessor.ts`
- [x] T052 [P] [US10] Implement Monday 00:00 FJT reset job in
      `api/src/jobs/weeklyReviewMissionReset.ts`

---

## Phase 13: User Story 11 - Review reminder notification (Priority: P3)

**Goal**: Pending reviewers receive reminder notifications 6h before window
close.

**Independent Test**: Eligible pending review creates notification record and
dispatch event; submitted/expired cases are skipped.

- [x] T053 [P] [US11] Add scheduler tests for eligible/ineligible reminder cases
      in `api/tests/integration/reviews.reminder.integration.test.ts`
- [x] T054 [US11] Implement reminder scheduling job writing pending notification
      records in `api/src/jobs/reviewReminder.ts`
- [x] T055 [P] [US11] Publish `notification.dispatch` events for reminders in
      `api/src/jobs/reviewReminder.ts`
- [x] T056 [US11] Add reminder dispatch handling via notifications package
      pipeline in `pkg/notifications/src/`
- [x] T057 [US11] Implement deep-link handling and stale-link fallback UX in
      `apps/mobile/rider/src/` and `apps/mobile/driver/src/`

---

## Phase 14: Polish & Cross-Cutting Concerns

- [x] T058 [P] Add end-to-end regression test covering bidirectional review +
      reveal + reminders in `api/tests/e2e/reviews.e2e.test.ts`
- [x] T059 [P] Add telemetry for SC-001 conversion and SC-002 latency in
      `api/src/services/reviewService.ts` and `apps/mobile/*/src/`
- [x] T060 [P] Update runbook and feature docs in `docs/runbooks/` and
      `specs/011-gamified-review-rating/quickstart.md`

---

## Dependencies

```text
Phase 1 -> Phase 2 -> Phases 3-13 -> Phase 14

US1 depends on Phase 2
US2 depends on Phase 2
US3 depends on US1/US2 UI baseline and Phase 2 service APIs
US4 depends on Phase 2 points logic
US5 depends on Phase 2 and active review submissions from US1/US2
US6 depends on Phase 2 event publication
US7 depends on US5 reveal logic
US8 depends on US7 aggregates
US9 depends on US7 aggregates and US6 worker flow
US10 depends on US6 worker/event infrastructure
US11 depends on notification infrastructure and review window logic from Phase 2
```

---

## Parallel Execution Examples

- T002, T003, T005, T006, T062 can run in parallel after T001 starts
- T008, T009, T011, T012 can run in parallel after T007 starts
- T013 and T014 can run in parallel; T061 should complete before T016/T021
- T037, T038, T040 can run in parallel before route completion T039
- T053, T055, T056, T057 can run in parallel once reminder scheduler model is
  defined

---

## Implementation Strategy

### MVP First (P1 only)

1. Complete Phase 1 and Phase 2
2. Deliver US1 and US2
3. Add US3, US4, US5
4. Validate P1 acceptance and release MVP

### Incremental Delivery

1. P1 release (US1-US5)
2. P2 release (US6-US9)
3. P3 release (US10-US11)
4. Final hardening and observability (Phase 14)

### Team Parallelization

1. Schema + foundation squad: Phases 1-2
2. Mobile squad: US1-US3 + US11 deep-link UX
3. API squad: US4-US5 + US7-US8
4. Worker/gamification squad: US6, US9, US10
5. QA/ops squad: Phase 14 validation and metrics

---

## Notes

- Story tasks are isolated by `[US#]` to support independent
  implementation/testing.
- [P] tasks target separate files or independent components.
- Keep route contracts and shared types synchronized with `@hakwa/types` before
  integration.
