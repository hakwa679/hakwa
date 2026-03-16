---
description: "Task list for User Registration & Authentication"
---

# Tasks: User Registration & Authentication

**Feature Branch**: `001-user-registration-auth` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Better
Auth, Drizzle ORM, PostgreSQL, Redis, Expo SecureStore

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and shared constants before any code is written

- [x] T001 Extend `user` table with `role`, `phone`, `isLocked`, `lockedUntil`,
      `lastLoginAt` columns in `pkg/db/schema/auth-schema.ts`
- [x] T002 Create `userProfile` table (`id`, `userId`, `onboardingComplete`,
      `avatarUrl`, `createdAt`, `updatedAt`) in `pkg/db/schema/auth-schema.ts`
- [x] T003 Export `userProfile` and updated `user` schema from
      `pkg/db/schema/index.ts`
- [x] T004 [P] Create `pkg/core/src/authConstants.ts` with
      `AUTH_LOCKOUT_MAX_ATTEMPTS` and `AUTH_LOCKOUT_DURATION_SECONDS`
- [x] T005 Run `db-push` to apply schema to database and confirm tables are
      correct

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Better Auth instance, auth handler, and lockout middleware must
exist before any auth route can function

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Configure Better Auth instance in `pkg/auth/lib/auth.ts` (Drizzle
      adapter, `requireEmailVerification: true`, custom schema for `role` and
      `phone` fields)
- [x] T007 Implement `authHandler` and `registerAuthRoutes` in
      `pkg/auth/lib/server.ts` — mount Better Auth handler at `/auth/*` on the
      Express app
- [x] T008 [P] Implement `checkLockout`, `recordFailedAttempt`, and
      `clearLockout` functions in `api/src/middleware/lockout.ts` using
      `@hakwa/redis` INCR/EXPIRE
- [x] T009 [P] Implement `getSessionFromRequest` helper in
      `pkg/auth/lib/server.ts` — extract Bearer token (mobile) or session cookie
      (web) and call Better Auth session lookup
- [x] T010 Export `auth`, `authHandler`, `registerAuthRoutes`,
      `getSessionFromRequest` from `pkg/auth/index.ts`
- [x] T011 Mount auth routes in `api/src/index.ts` using `registerAuthRoutes`

**Checkpoint**: Foundation complete — Better Auth handler is live, lockout
middleware is ready

---

## Phase 3: User Story 1 — Passenger Self-Registration (Priority: P1) 🎯 MVP

**Goal**: A new passenger can register, receive a verification email, verify
their address, and reach the authenticated home screen.

**Independent Test**: POST `/auth/sign-up/email` creates a user with
`role=passenger`; a verification email is sent; clicking the link calls
`/auth/verify-email`; user is signed in and routed to booking screen.

- [ ] T012 [US1] Verify `POST /auth/sign-up/email` accepts
      `{ email, password, name, role }` and returns `201` with `session: null`
      (email unverified) — validate using Better Auth config in
      `pkg/auth/lib/auth.ts`
- [ ] T013 [P] [US1] Build passenger registration screen in
      `apps/mobile/rider/src/auth/RegisterScreen.tsx` — fields: full name,
      email, password with inline strength validation
- [ ] T014 [P] [US1] Build passenger registration page in
      `apps/web/src/auth/RegisterPage.tsx` — same fields as mobile screen
- [ ] T015 [US1] Wire register form submission to `POST /auth/sign-up/email` via
      `@hakwa/api-client` in both rider app and web portal
- [ ] T016 [P] [US1] Build email verification landing page in
      `apps/web/src/auth/VerifyEmailPage.tsx` — handles `?token=` query param,
      calls `POST /auth/verify-email`
- [ ] T017 [US1] Handle deep-link redirect on mobile for email verification in
      `apps/mobile/rider/src/_layout.tsx` — route to authenticated home on
      success

**Checkpoint**: User Story 1 complete — passenger registration and verification
are fully functional

---

## Phase 4: User Story 2 — Sign In & Session Management (Priority: P1)

**Goal**: A verified user can sign in, sessions persist across app restarts, and
sign-out invalidates all sessions.

**Independent Test**: Sign in with verified credentials returns a session token;
app restart restores session via `GET /api/auth/session`; sign-out calls
`POST /auth/sign-out` and returns to sign-in screen.

- [x] T018 [US2] Implement lockout check in sign-in flow — before Better Auth
      sign-in, call `checkLockout` in `api/src/middleware/lockout.ts`; on
      failure call `recordFailedAttempt`; on success call `clearLockout`
- [x] T019 [US2] Add `GET /api/auth/session` route in `api/src/routes/auth.ts` —
      requires auth, returns `{ user, session }` using `getSessionFromRequest`
- [ ] T020 [US2] Implement session restore on app launch in
      `apps/mobile/rider/src/_layout.tsx` — read token from Expo SecureStore,
      call `GET /api/auth/session`, route to home if valid
- [ ] T021 [P] [US2] Implement session restore in
      `apps/mobile/driver/src/_layout.tsx`
- [ ] T022 [P] [US2] Implement session restore in
      `apps/mobile/merchant/src/_layout.tsx`
- [ ] T023 [P] [US2] Build sign-in screen in
      `apps/mobile/rider/src/auth/SignInScreen.tsx` — email/password,
      loading/error/success states, lockout error message
- [ ] T024 [P] [US2] Build sign-in page in `apps/web/src/auth/SignInPage.tsx`
- [ ] T025 [US2] Implement role-based routing post sign-in — passenger → booking
      screen, driver → availability screen, merchant → dashboard — in respective
      app `_layout.tsx` files
- [ ] T026 [US2] Implement sign-out — call `POST /auth/sign-out`, clear token
      from SecureStore, redirect to sign-in screen — in all three mobile apps

**Checkpoint**: User Story 2 complete — sign in, session persistence, and
sign-out are functional

---

## Phase 5: User Story 3 — Password Reset (Priority: P2)

**Goal**: A user who cannot sign in can request a reset email, set a new
password, and be signed in immediately.

**Independent Test**: `POST /auth/forgot-password` always returns
`{ success: true }`; reset link calls `POST /auth/reset-password`; all sessions
revoked; user signed in with new session.

- [ ] T027 [P] [US3] Build "Forgot Password" screen in
      `apps/mobile/rider/src/auth/ForgotPasswordScreen.tsx` — single email
      field, calls `POST /auth/forgot-password`
- [ ] T028 [P] [US3] Build "Forgot Password" page in
      `apps/web/src/auth/ForgotPasswordPage.tsx`
- [ ] T029 [P] [US3] Build "Reset Password" page in
      `apps/web/src/auth/ResetPasswordPage.tsx` — reads `?token=` param, submits
      to `POST /auth/reset-password`
- [ ] T030 [US3] Handle reset deep-link on mobile in
      `apps/mobile/rider/src/_layout.tsx` — route to reset password screen with
      token
- [ ] T031 [US3] Validate expired/used token error on reset page — show "link no
      longer valid" message with "Request new link" CTA

**Checkpoint**: User Story 3 complete — password reset flow is functional

---

## Phase 6: User Story 4 — Driver & Merchant Account Creation (Priority: P2)

**Goal**: Drivers and merchants can register through their respective apps with
role-specific fields.

**Independent Test**: Driver registers with `role=driver`, receives verification
email, verifies, reaches driver availability screen. Merchant registers with
`role=merchant`, reaches merchant dashboard.

- [ ] T032 [P] [US4] Build driver registration screen in
      `apps/mobile/driver/src/auth/RegisterScreen.tsx` — fields: name, email,
      password, phone number; sets `role=driver`
- [ ] T033 [P] [US4] Build merchant registration screen in
      `apps/mobile/merchant/src/auth/RegisterScreen.tsx` — fields: name, email,
      password, phone number, licensing tier; sets `role=merchant`
- [ ] T034 [US4] Wire driver registration form to `POST /auth/sign-up/email`
      with `role=driver` and `phone` fields via `@hakwa/api-client` in driver
      app
- [ ] T035 [US4] Wire merchant registration form to `POST /auth/sign-up/email`
      with `role=merchant` and `phone` fields via `@hakwa/api-client` in
      merchant app
- [ ] T036 [P] [US4] Build driver sign-in screen in
      `apps/mobile/driver/src/auth/SignInScreen.tsx`
- [ ] T037 [P] [US4] Build merchant sign-in screen in
      `apps/mobile/merchant/src/auth/SignInScreen.tsx`
- [ ] T038 [US4] After email verification, route driver to availability screen
      and merchant to dashboard with "complete profile" prompt in respective
      `_layout.tsx` files

**Checkpoint**: User Story 4 complete — driver and merchant registration are
functional

---

## Phase 7: User Story 5 — Re-sending Verification Email (Priority: P3)

**Goal**: A user with an unverified account can request a new verification email
with a 60-second cooldown.

**Independent Test**: `POST /api/auth/resend-verification` returns `200`; a
second call within 60 s returns `429 RESEND_COOLDOWN`; verification email
arrives and can be used.

- [x] T039 [US5] Implement `POST /api/auth/resend-verification` route in
      `api/src/routes/auth.ts` — check Redis cooldown key (60 s TTL), send email
      via `@hakwa/email`, set cooldown key
- [ ] T040 [US5] On sign-in with unverified email (`403 EMAIL_NOT_VERIFIED`),
      show "Resend verification email" notice in rider, driver, and merchant
      sign-in screens with cooldown countdown

**Checkpoint**: User Story 5 complete — resend verification is functional with
cooldown

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T041 [P] Wrap all auth errors as `AppError` subclasses and validate they
      pass through Express error middleware in `api/src/index.ts`
- [x] T042 [P] Verify no stack traces appear in any auth error response payload
      (production safety check)
- [x] T043 [P] Ensure `lastLoginAt` on the `user` record is updated on every
      successful sign-in by hooking into Better Auth's `onSignIn` callback in
      `pkg/auth/lib/auth.ts`
- [x] T044 [P] Verify account enumeration prevention on
      `POST /auth/forgot-password` and `POST /api/auth/resend-verification` —
      both must return `200` regardless of whether email exists
- [ ] T045 Add E2E smoke test script in
      `specs/001-user-registration-auth/quickstart.md` manual verification steps

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Foundation) → Phase 3–7 (User Stories, can run in priority order)
US1 (registration) → US2 (sign-in) [needs verified account]
US3, US4, US5 are independent of each other after Phase 2
```

## Parallel Execution Examples

- T001 + T004 can run in parallel (different files)
- T013 + T014 can run in parallel (rider app + web page)
- T021 + T022 can run in parallel (driver + merchant app)
- T027 + T028 can run in parallel (mobile + web forgot password)
- T032 + T033 can run in parallel (driver + merchant registration)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T017) — passenger registration +
  email verification
- **MVP+**: Add Phase 4 (T018–T026) — sign-in, session restore, sign-out
- **Full P2**: Add Phase 5 + 6 (T027–T038) — password reset, driver/merchant
  registration
- **Complete**: Add Phase 7 + Polish (T039–T045)

**Total tasks**: 45 | **Parallelizable**: 22 | **User stories**: 5
