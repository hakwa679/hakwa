---
description: "Task list for Merchant Onboarding"
---

# Tasks: Merchant Onboarding

**Feature Branch**: `002-merchant-onboarding` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Drizzle
ORM, PostgreSQL, Better Auth, Redis, Expo (Merchant App), React + Vite (Merchant
Portal)

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes must land before API or UI work begins

- [ ] T001 Add `userId`, `licenseType`, `status`, `nationalId`, `phone` columns
      to `merchant` table in `pkg/db/schema/merchant.ts`
- [ ] T002 Create `vehicle` table (`id`, `merchantId`, `make`, `model`, `year`,
      `registrationPlate`, `seatingCapacity`, `color`, `isActive`, `createdAt`,
      `updatedAt`) in `pkg/db/schema/merchant.ts`
- [ ] T003 Export updated `merchant` and new `vehicle` schema from
      `pkg/db/schema/index.ts`
- [ ] T004 Run `db-push` to apply schema and confirm `merchant` columns and
      `vehicle` table exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service and middleware must be in place before any route can
be wired

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Implement `getMerchantByUserId`, `updateMerchantProfile`,
      `checkOnboardingCompletion`, and `submitForReview` in
      `api/src/services/merchantService.ts`
- [ ] T006 [P] Add `requireRole` middleware in
      `api/src/middleware/requireRole.ts` — checks session user's role against
      allowed roles, throws `ForbiddenError` otherwise
- [ ] T007 [P] Add `requireOwnMerchant` middleware in
      `api/src/middleware/requireOwnMerchant.ts` — asserts
      `merchant.userId === session.userId`
- [ ] T008 Define `LicenseType` (`'licensed' | 'unlicensed'`) and
      `MerchantStatus`
      (`'draft' | 'under_review' | 'approved' | 'rejected' | 'suspended_pending_review'`)
      union types in `api/src/types/merchant.ts`
- [ ] T009 Register merchant routes in `api/src/index.ts` by mounting
      `api/src/routes/merchants.ts`

**Checkpoint**: Foundation complete — service layer and middleware ready for
route implementation

---

## Phase 3: User Story 1 — Licensed Merchant Completes Onboarding (Priority: P1) 🎯 MVP

**Goal**: A licensed merchant can complete all wizard steps (business details,
bank account, vehicle) and submit for review.

**Independent Test**: `POST /api/merchants/me/submit` with all steps complete
transitions status to `under_review` and returns `{ status: "under_review" }`.
All three `onboardingSteps` flags are `true` beforehand.

- [ ] T010 [US1] Implement `GET /api/merchants/me` in
      `api/src/routes/merchants.ts` — returns merchant profile with
      `onboardingSteps` computed flags
- [ ] T011 [US1] Implement `PATCH /api/merchants/me` in
      `api/src/routes/merchants.ts` — allows updates in `draft` and
      `under_review` states; validates TIN + businessRegistrationNumber for
      licensed tier
- [ ] T012 [US1] Implement `POST /api/merchants/me/submit` in
      `api/src/routes/merchants.ts` — validates all three onboarding sections
      complete, transitions to `under_review`, dispatches admin notification via
      `@hakwa/notifications`
- [ ] T013 [P] [US1] Build `LicenseTypeScreen.tsx` in
      `apps/mobile/merchant/src/screens/onboarding/LicenseTypeScreen.tsx` —
      single selection: licensed / unlicensed
- [ ] T014 [P] [US1] Build `BusinessDetailsScreen.tsx` in
      `apps/mobile/merchant/src/screens/onboarding/BusinessDetailsScreen.tsx` —
      shows TIN + LTA fields only for licensed tier
- [ ] T015 [P] [US1] Build `BankAccountScreen.tsx` in
      `apps/mobile/merchant/src/screens/onboarding/BankAccountScreen.tsx` — bank
      name, account number, account holder name
- [ ] T016 [P] [US1] Build `VehicleScreen.tsx` in
      `apps/mobile/merchant/src/screens/onboarding/VehicleScreen.tsx` — make,
      model, year, registration plate, seating capacity, color
- [ ] T017 [P] [US1] Build `ReviewScreen.tsx` in
      `apps/mobile/merchant/src/screens/onboarding/ReviewScreen.tsx` — summary
      of all collected data, "Submit for review" button
- [ ] T018 [US1] Wire onboarding wizard flow — auto-launch wizard in
      `apps/mobile/merchant/src/screens/MerchantDashboard.tsx` if
      `onboardingComplete = false`; connect each screen to API via
      `@hakwa/api-client`
- [ ] T019 [US1] Show progress indicator in wizard header showing completed /
      remaining steps

**Checkpoint**: User Story 1 complete — licensed merchant onboarding is fully
functional

---

## Phase 4: User Story 2 — Unlicensed Merchant Completes Onboarding (Priority: P1)

**Goal**: An unlicensed merchant sees a lighter wizard (identity + vehicle only,
no TIN/LTA fields) and can submit for review.

**Independent Test**: Merchant with `licenseType=unlicensed` sees only identity
and vehicle steps; `POST /api/merchants/me/submit` succeeds without TIN or
businessRegistrationNumber.

- [ ] T020 [US2] Update `BusinessDetailsScreen.tsx` to conditionally show
      `nationalId` field and hide TIN / LTA fields when
      `licenseType = 'unlicensed'`
- [ ] T021 [US2] Update `PATCH /api/merchants/me` validation in
      `api/src/routes/merchants.ts` — require `nationalId` for unlicensed;
      require TIN + businessRegistrationNumber for licensed
- [ ] T022 [US2] Add duplicate TIN check in `merchantService.ts` — reject
      submission if TIN already registered to another merchant with clear error
      message

**Checkpoint**: User Story 2 complete — unlicensed merchant onboarding is
functional

---

## Phase 5: User Story 3 — Merchant Updates Details Before Approval (Priority: P2)

**Goal**: An `under_review` merchant can edit their bank account details from
the profile screen.

**Independent Test**: `PATCH /api/merchants/me` with updated bank account
returns `200`; calling `GET /api/merchants/me` shows the updated data; status
remains `under_review`.

- [ ] T023 [US3] Implement `PUT /api/merchants/me/bank-account` in
      `api/src/routes/merchants.ts` — upsert bank account record via
      `bankAccount` table with `holderType = 'merchant'`; blocked for `approved`
      merchants
- [ ] T024 [US3] Build "Edit Payout Account" screen in
      `apps/mobile/merchant/src/screens/settings/PayoutAccountScreen.tsx` —
      shows current bank details with edit form
- [ ] T025 [US3] Wire edit form to `PUT /api/merchants/me/bank-account` via
      `@hakwa/api-client` with success/error feedback

**Checkpoint**: User Story 3 complete — bank account editing before approval is
functional

---

## Phase 6: User Story 4 — Adding Vehicles After Approval (Priority: P3)

**Goal**: An `approved` merchant can add vehicles to their fleet and see them
listed.

**Independent Test**: `POST /api/merchants/me/vehicles` creates a vehicle linked
to the merchant; `GET /api/merchants/me/vehicles` returns it in the list;
duplicate plate returns `409`.

- [ ] T026 [US4] Implement `GET /api/merchants/me/vehicles` in
      `api/src/routes/merchants.ts` — list all vehicles for the current merchant
- [ ] T027 [US4] Implement `POST /api/merchants/me/vehicles` in
      `api/src/routes/merchants.ts` — create vehicle, enforce UNIQUE on
      `registrationPlate`, return `409 PLATE_CONFLICT` on duplicate
- [ ] T028 [P] [US4] Implement `PATCH /api/merchants/me/vehicles/:vehicleId` in
      `api/src/routes/merchants.ts` — partial update with ownership check
- [ ] T029 [US4] Build "Fleet" screen in
      `apps/mobile/merchant/src/screens/fleet/FleetScreen.tsx` — list of
      vehicles with "Add vehicle" button
- [ ] T030 [US4] Build "Add Vehicle" screen in
      `apps/mobile/merchant/src/screens/fleet/AddVehicleScreen.tsx` — same
      fields as onboarding vehicle step, wired to
      `POST /api/merchants/me/vehicles`

**Checkpoint**: User Story 4 complete — fleet management is functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Mid-flow wizard progress persistence — save each step's data to
      local state so that on app restart the wizard resumes from the last
      incomplete step
- [ ] T032 [P] Merchant dashboard status banner — show clear status message
      based on `status` field (`under_review`, `approved`, `rejected`) in
      `apps/mobile/merchant/src/screens/MerchantDashboard.tsx`
- [ ] T033 [P] Admin notification dispatch on `POST /api/merchants/me/submit` —
      verify `@hakwa/notifications` Redis Stream event is published post-commit
      in `merchantService.ts`
- [ ] T034 [P] Validate all merchant API routes return correct `AppError`
      subtypes (`ValidationError`, `ConflictError`, `ForbiddenError`) and no
      stack traces in 4xx/5xx responses

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Foundation) → Phase 3–6 (User Stories)
US1 (licensed wizard) → US2 (unlicensed wizard) [US2 extends US1 screens]
US3 (update details) independent of US2 after Phase 2
US4 (add vehicles) independent of US3 after Phase 2
```

## Parallel Execution Examples

- T006 + T007 can run in parallel (different middleware files)
- T013 + T014 + T015 + T016 + T017 can run in parallel (separate screen files)
- T026 + T027 + T028 can run in parallel (different route handlers)
- T029 + T030 can run in parallel (different screen files)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T019) — licensed merchant
  onboarding end-to-end
- **MVP+**: Add Phase 4 (T020–T022) — unlicensed merchant support
- **Full P2**: Add Phase 5 (T023–T025) — pre-approval edits
- **Complete**: Add Phase 6 + Polish (T026–T034)

**Total tasks**: 34 | **Parallelizable**: 16 | **User stories**: 4
