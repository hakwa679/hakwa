# Implementation Plan: User Registration & Authentication

**Branch**: `001-user-registration-auth` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from
`/specs/001-user-registration-auth/spec.md`

---

## Summary

User registration, email verification, sign-in/sign-out, password reset, and
session management for passengers, drivers, and merchants. **Better Auth**
(`@hakwa/auth`) is the authentication engine with the Drizzle PostgreSQL
adapter. The `user` table gains a `role` column and a `userProfile` table
provides onboarding state. Account lockout is enforced via Redis counters.
Mobile session tokens are persisted in Expo SecureStore.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `better-auth`, `@hakwa/auth`, `@hakwa/db` (Drizzle),
`@hakwa/email`, `@hakwa/redis`, `@hakwa/errors`, `expo-secure-store`  
**Storage**: PostgreSQL — `user`, `session`, `account`, `verification`,
`user_profile` tables  
**Testing**: Vitest + Supertest (API integration); Expo testing for mobile
session restore  
**Target Platform**: Node.js API server; React Native Expo
(Rider/Driver/Merchant apps); React + Vite (web portals)  
**Project Type**: Monorepo — Express API + five frontend apps  
**Performance Goals**: Sign-in < 200ms p95; email delivery < 30 s  
**Constraints**: Account enumeration must be impossible on forgot-password and
resend flows; sessions must survive app restarts  
**Scale/Scope**: Phase 1 — up to 10k registered users; three role types

---

## Constitution Check

_Post-design gate — all principles evaluated against this feature's design._

- [x] **I. Package-First** — Auth logic in `@hakwa/auth`; lockout helpers in
      `api/src/middleware/lockout.ts` (API-local, not shared); resend cooldown
      Redis call in route handler.
- [x] **II. Type Safety** — `user.$inferSelect` used for session type; Better
      Auth provides typed session object; role field typed as union literal.
- [x] **III. Security** — Session auth on all protected endpoints; secrets from
      env only; account enumeration prevented on reset/resend; password strength
      enforced; input sanitised by Better Auth before use.
- [x] **IV. Schema Contract** — `user` extension and `userProfile` defined in
      `pkg/db/schema/auth-schema.ts`; `db-push` run before API code written.
- [ ] **V. Real-Time** — _Not applicable_: auth events (sign-in, sign-out) are
      synchronous REST interactions; no real-time fan-out required for this
      feature.
- [x] **VI. Redis Package** — Lockout counter and resend cooldown use
      `@hakwa/redis`; `REDIS_URL` env var configured.
- [ ] **VIII. Concurrency Safety** — _Not applicable_: Better Auth handles
      session token uniqueness; lockout uses atomic Redis `INCR`; no wallet or
      trip mutations.
- [ ] **IX. Webhook-First** — _Not applicable_: no external webhook integrations
      in auth flow.
- [ ] **X. Worker-Thread Concurrency** — _Not applicable_: no CPU-bound work in
      auth; email dispatch is async I/O, not CPU-bound.
- [x] **XI. Unified Error Handling** — All auth errors wrapped as `AppError`
      subclasses; single Express error middleware handles responses; no stack
      traces in payloads.
- [x] **XII. Frontend Architecture** — Session token stored via
      `@hakwa/api-     client` pattern; EXPO_PUBLIC_API_URL used for base URL;
      no hardcoded URLs.
- [x] **XIII. Shared-First Reuse** — Auth utilities in `@hakwa/auth`; lockout
      constants in `@hakwa/core`; no duplication across apps.
- [ ] **XIV. Notification System** — `email_verification` and `password_reset`
      emails sent via `@hakwa/email` directly (not via notification pipeline) —
      these are transactional auth emails, not engagement notifications.
- [x] **XV. UI Design System** — Registration and sign-in screens use
      `@hakwa/tokens` colours; touch targets ≥ 44pt; dark mode primary.
- [x] **XVI. UX Principles** — Inline validation before submit; three states
      (loading/success/error) on all auth forms; error messages include recovery
      action; two-step confirmation not needed for registration.
- [ ] **XVII. Mapping** — _Not applicable_: no map UI in auth flows.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-user-registration-auth/
├── plan.md              ← this file
├── research.md          ← Better Auth choice, role extension, lockout, session persistence
├── data-model.md        ← user table extension + userProfile table
├── quickstart.md        ← schema push → auth config → route mounting → mobile persistence
└── contracts/
    └── rest-api.md      ← Better Auth routes + custom resend & session endpoints
```

### Source Code

```text
pkg/
├── auth/
│   ├── lib/
│   │   ├── auth.ts         ← Better Auth instance (extended with role, phone fields)
│   │   └── server.ts       ← authHandler, registerAuthRoutes, getSessionFromRequest
│   ├── index.ts
│   └── package.json
├── db/
│   └── schema/
│       └── auth-schema.ts  ← user (extended), session, account, verification, userProfile
└── core/
    └── src/
        └── authConstants.ts ← AUTH_LOCKOUT_MAX_ATTEMPTS, AUTH_LOCKOUT_DURATION_SECONDS

api/
└── src/
    ├── middleware/
    │   └── lockout.ts       ← checkLockout, recordFailedAttempt, clearLockout
    └── routes/
        └── auth.ts          ← POST /api/auth/resend-verification, GET /api/auth/session

apps/
├── mobile/
│   ├── rider/src/           ← session restore in _layout.tsx
│   ├── driver/src/
│   └── merchant/src/
└── web/src/
    └── auth/                ← sign-in / register / verify pages
```

**Structure Decision**: Option 3 (Mobile + API). Auth logic is in `@hakwa/auth`
package. The API exposes thin custom wrappers; Better Auth's handler covers
standard flows. Mobile apps use Expo SecureStore for session persistence; web
uses httpOnly cookies.
