# Implementation Plan: Merchant Onboarding

**Branch**: `002-merchant-onboarding` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from `/specs/002-merchant-onboarding/spec.md`

---

## Summary

Step-by-step onboarding wizard for licensed and unlicensed merchants. The
`merchant` table gains `userId`, `licenseType`, `status`, `nationalId`, and
`phone` columns. A new `vehicle` table captures physical vehicle records. The
existing `bankAccount` table (wallet schema) is reused for payout destinations.
Submission transitions status to `under_review` and dispatches a notification to
admin users via the Redis Stream pipeline.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db` (Drizzle), `@hakwa/auth`,
`@hakwa/notifications`, `@hakwa/errors`, `@hakwa/redis`  
**Storage**: PostgreSQL — `merchant` (extended), `vehicle` (new), `bankAccount`
(reused)  
**Testing**: Vitest + Supertest (API integration); Merchant App E2E (wizard
flow)  
**Target Platform**: Node.js API; React Native Expo (Merchant App); React + Vite
(Merchant Portal)  
**Project Type**: Monorepo — Express API + Merchant App + Merchant Web Portal  
**Performance Goals**: Wizard step saves < 300ms; submission < 500ms  
**Constraints**: Both licensing tiers must be handled explicitly; no silent
defaulting to one tier  
**Scale/Scope**: Phase 1 — licensed and unlicensed taxi merchants

---

## Constitution Check

- [x] **I. Package-First** — `vehicle` schema in `@hakwa/db`; merchant service
      logic in `api/src/services/merchantService.ts`.
- [x] **II. Type Safety** — `merchant.$inferSelect` for types; `LicenseType` and
      `MerchantStatus` as union types; bank account FK validated at DB level.
- [x] **III. Security** — `requireAuth` + `requireRole('merchant')` middleware
      on all routes; merchant can only edit their own record (userId check).
- [x] **IV. Schema Contract** — `vehicle` table and `merchant` extensions
      defined in `pkg/db/schema/merchant.ts`; `db-push` before API code.
- [ ] **V. Real-Time** — _Not applicable_: onboarding is a synchronous wizard;
      no real-time events needed.
- [x] **VI. Redis Package** — Notification dispatch uses `@hakwa/redis` via
      notification system.
- [ ] **VIII. Concurrency Safety** — _Not applicable_: onboarding writes are
      single-user; no concurrent mutations.
- [x] **IX. Webhook-First** — Admin notification dispatched via Redis Stream
      post-commit (non-blocking), per Principle IX.
- [ ] **X. Worker-Thread Concurrency** — _Not applicable_: no CPU-bound work in
      onboarding.
- [x] **XI. Unified Error Handling** — `ValidationError`, `ConflictError`,
      `ForbiddenError` from `@hakwa/errors`; single Express error middleware.
- [x] **XII. Frontend Architecture** — Merchant App wizard uses
      `@hakwa/api-client` hooks; `EXPO_PUBLIC_API_URL` env var; shared form
      components in `@hakwa/ui-native`.
- [x] **XIII. Shared-First Reuse** — `merchantService.ts` in API services; no
      onboarding logic duplicated in app code.
- [x] **XIV. Notification System** — Submit-for-review triggers admin
      notification via `@hakwa/notifications` post-commit.
- [x] **XV. UI Design System** — Wizard screens use `@hakwa/tokens`; dark mode
      primary; touch targets ≥ 44pt.
- [x] **XVI. UX Principles** — Progress indicator on wizard; inline validation;
      three states per submit; clear status banner on dashboard.
- [ ] **XVII. Mapping** — _Not applicable_: no map UI in onboarding.
- [x] **XVIII. Official Documentation First** — Drizzle schema API, Better Auth
      role fields, and Express Router patterns verified against official docs;
      no version pinned from memory.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-merchant-onboarding/
├── plan.md             ← this file
├── research.md         ← state machine, license split, vehicle table, bank account reuse
├── data-model.md       ← merchant extension + vehicle table
├── quickstart.md       ← schema push → service → routes → wizard flow
└── contracts/
    └── rest-api.md     ← merchant profile, bank account, vehicle CRUD endpoints
```

### Source Code

```text
pkg/
└── db/
    └── schema/
        └── merchant.ts     ← merchant (extended: userId, licenseType, status, nationalId)
                               vehicle (new table)

api/
└── src/
    ├── services/
    │   └── merchantService.ts   ← checkOnboardingCompletion, submitForReview, CRUD helpers
    └── routes/
        └── merchants.ts         ← GET/PATCH /me, POST /me/submit, PUT /me/bank-account,
                                    vehicle CRUD

apps/
└── mobile/
    └── merchant/
        └── src/screens/onboarding/
            ├── LicenseTypeScreen.tsx
            ├── BusinessDetailsScreen.tsx
            ├── BankAccountScreen.tsx
            ├── VehicleScreen.tsx
            └── ReviewScreen.tsx
```

**Structure Decision**: Option 3 (Mobile + API). Onboarding logic in
`api/src/services/merchantService.ts`. Schema in `@hakwa/db`. The Merchant App
hosts the wizard UI; the Merchant Web Portal hosts an equivalent web flow.
