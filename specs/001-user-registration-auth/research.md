# Research: User Registration & Authentication

_Phase 0 output for `001-user-registration-auth`_

---

## 1. Auth Library — Better Auth

**Decision**: Use **Better Auth** (`better-auth`) as the authentication
framework, integrated via `@hakwa/auth` package.

**Rationale**:

- Already installed and wired up in `pkg/auth/lib/auth.ts` with Drizzle adapter
  against PostgreSQL.
- Provides email/password authentication with mandatory email verification
  out-of-the-box.
- Handles session creation, token rotation, and sign-out natively.
- Rate-limiting middleware configured at 100 requests per 15 minutes, stored
  in the database — no additional Redis limiter needed for auth endpoints.
- `betterAuth.emailAndPassword.requireEmailVerification = true` enforces
  verified-email gate.

**Role extension strategy**:

Better Auth's `user` table stores base identity. Hakwa roles
(`passenger | driver | merchant`) require an additive `role` column on the
`user` table (Drizzle migration) and a `userProfile` table for role-specific
fields injected via Better Auth's `customSchema` hook.

**Alternatives considered**:

- _Passport.js_: Requires manual session management, no built-in Drizzle
  adapter. Rejected — more boilerplate for the same result.
- _Auth.js (NextAuth)_: Next.js-centric; Express integration is community-
  maintained. Rejected — Better Auth has first-class Express support via
  `@hakwa/auth`'s `authHandler`.
- _Custom JWT implementation_: Maximum control but substantial security
  surface. Rejected — Better Auth is battle-tested against the same threat
  model.

---

## 2. Role-Based User Extension

**Decision**: Extend the `user` table with a `role` column
(`passenger | driver | merchant`) and a separate `userProfile` table containing
role-specific onboarding state.

**Rationale**:

- All three roles share the same auth flow (email + password, verification,
  sessions). Forking auth schemas per role creates unnecessary divergence.
- `userProfile` decouples onboarding data from auth data, following the
  single-responsibility principle. Auth endpoints stay clean; onboarding data
  lives in the profile.
- `role` gates post-login routing: passengers → booking screen; drivers →
  availability screen; merchants → dashboard. The frontend reads `role` from
  session on every app launch.

**Schema additions**:

```sql
ALTER TABLE "user" ADD COLUMN role text NOT NULL DEFAULT 'passenger'
  CHECK (role IN ('passenger', 'driver', 'merchant'));
```

`userProfile` fields deferred to the Merchant Onboarding spec (002).

**Alternatives considered**:

- Separate user tables per role: maximally type-safe but duplicates auth
  fields and complicates Better Auth integration. Rejected.
- A single `role` column with no profile table: simple but couples onboarding
  state (merchant status, driver licence) to the auth record. Rejected.

---

## 3. Email Verification & Password Reset

**Decision**: Use Better Auth's built-in `emailVerification` and password reset
flows, hooking into `@hakwa/email` for actual email delivery.

**Rationale**:

- `sendVerificationEmail` is already wired in `pkg/auth/lib/auth.ts`.
- Better Auth generates time-limited tokens, handles token invalidation on use,
  and provides the resend-cooldown mechanism natively when `expiresIn` is
  configured.
- The `verification` table (already seeded by Better Auth schema) stores tokens
  with `expiresAt` — expired or used tokens return 400 before any processing.

**Security considerations**:

- Password reset responses MUST NOT confirm whether an account exists
  (prevents account enumeration). Better Auth returns a generic success
  regardless of whether the email is registered.
- After a successful password reset, Better Auth invalidates all active
  sessions for that user (call `auth.api.revokeUserSessions`).
- After sign-out, the session token is deleted from the `session` table
  (Better Auth default).

**Resend cooldown**:

Better Auth does not natively enforce a per-user resend cooldown. A lightweight
Redis `SET nx ex 60 resend:{userId}` check is added in the `POST /auth/resend`
route handler (thin wrapper over Better Auth's resend API) to enforce the 60-
second gate described in User Story 5.

---

## 4. Account Lockout on Repeated Failures

**Decision**: Implement a consecutive-failure counter using a Redis key
`auth:lockout:{email}` with TTL equal to the configurable lockout period.

**Rationale**:

- Better Auth's built-in rate limiter operates at the HTTP level (total request
  count), not at the per-account-per-wrong-credential level. A dedicated
  lockout counter gives per-account precision.
- Redis TTL-based keys are atomic (via `INCR` + `EXPIRE`) and require no
  database round-trip during a locked state check.
- Lockout check runs as Express middleware before the Better Auth handler on
  `POST /auth/sign-in`. On `401` from Better Auth, the middleware increments the
  counter; on success the counter is deleted.

**Constants**:

```ts
export const AUTH_LOCKOUT_MAX_ATTEMPTS = 3 as const;
export const AUTH_LOCKOUT_DURATION_SECONDS = 300 as const; // 5 minutes default
```

Both stored in `@hakwa/core` and readable by the auth service.

---

## 5. Session Persistence on Mobile

**Decision**: Mobile apps store the Better Auth session token in
**Expo SecureStore** (`expo-secure-store`), keyed as `hakwa_session_token`.

**Rationale**:

- Expo SecureStore uses iOS Keychain / Android Keystore — hardware-backed
  credential storage safe against app-sandbox escapes.
- On each app launch, the stored token is passed as the `Authorization: Bearer
  <token>` header to `GET /auth/get-session`. Better Auth validates the token
  and returns the user object — the app is restored without re-authentication.
- On sign-out, the stored token is deleted from SecureStore after the server
  call succeeds.

**Web**:

Better Auth's web client stores the session in an `httpOnly` cookie managed by
the browser. No explicit token handling required in web app code.

---
