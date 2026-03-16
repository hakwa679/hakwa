# Feature Specification: User Registration & Authentication

**Feature Branch**: `001-user-registration-auth`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User registration, login, email verification, password reset, and
session management for passengers, drivers, and merchants

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Passenger Self-Registration (Priority: P1)

A new passenger downloads the Rider App or visits the Rider Portal and creates
an account using their email address and a password. They receive a verification
email, click the link to confirm their address, and are then taken to the
authenticated home screen.

**Why this priority**: No other feature on the platform is accessible without a
verified account. Passenger registration is the top-of-funnel action for all
trip bookings.

**Independent Test**: A new user can register, receive a verification email,
verify their address, and reach the authenticated home screen — delivering a
ready-to-book account with no other features required.

**Acceptance Scenarios**:

1. **Given** a visitor on the registration screen, **When** they submit a valid
   email, strong password, and full name, **Then** the system creates a pending
   account and sends a verification email within 30 seconds.
2. **Given** a pending account, **When** the user clicks the verification link
   in the email, **Then** the account is marked verified and the user is signed
   in automatically.
3. **Given** an already-registered email, **When** a user attempts to register
   with that email, **Then** the system shows a clear message directing them to
   sign in or reset their password — without confirming whether the email
   exists.
4. **Given** a registration form with a weak password (under 8 characters),
   **When** the user submits, **Then** the form shows an inline error before
   submission occurs.

---

### User Story 2 - Sign In & Session Management (Priority: P1)

A returning user opens the app or portal, enters their credentials, and is taken
directly to their home screen. Their session persists across app restarts. When
they explicitly sign out, all active sessions are terminated.

**Why this priority**: Every returning user must be able to sign in reliably. A
broken sign-in flow blocks 100% of returning-user activity.

**Independent Test**: A verified account can sign in, remain authenticated after
closing and reopening the app, and sign out successfully.

**Acceptance Scenarios**:

1. **Given** a verified account, **When** the user enters their correct email
   and password, **Then** they are signed in and routed to their role's home
   screen (passenger → booking screen, driver → availability screen, merchant →
   dashboard).
2. **Given** an authenticated session, **When** the user closes and reopens the
   app, **Then** the session is restored without requiring re-authentication.
3. **Given** an authenticated user, **When** they tap "Sign out", **Then** all
   active sessions for that user are invalidated and they are returned to the
   sign-in screen.
4. **Given** incorrect credentials (3 or more consecutive attempts), **When**
   the user submits, **Then** the account is temporarily locked for a
   configurable cooldown period and the user is informed in plain language.

---

### User Story 3 - Password Reset (Priority: P2)

A user who has forgotten their password requests a reset link. They receive an
email with a time-limited link, set a new password, and are immediately signed
in.

**Why this priority**: Without password recovery, locked-out users churn
permanently. This is standard gate-keeping for account retention.

**Independent Test**: A user who cannot sign in can initiate a reset, receive an
email, set a new password, and reach the authenticated home screen.

**Acceptance Scenarios**:

1. **Given** the sign-in screen, **When** the user taps "Forgot password?" and
   submits their email, **Then** a reset email is sent if the account exists —
   the response gives no indication either way (to prevent account enumeration).
2. **Given** a valid reset link (not yet expired), **When** the user sets a new
   password meeting strength requirements, **Then** the password is updated, the
   reset link is invalidated, all existing sessions are terminated, and the user
   is signed in with a new session.
3. **Given** an expired or previously-used reset link, **When** the user opens
   it, **Then** they see a clear message that the link is no longer valid and
   are prompted to request a new one.

---

### User Story 4 - Driver & Merchant Account Creation (Priority: P2)

An operator (driver, captain, biker, pilot, or other vehicle operator) registers
through the Driver App. A merchant (fleet or seat owner) registers through the
Merchant App. The registration flow captures role-specific information (vehicle
details for operators; business/identity details for merchants) in addition to
base account credentials, while keeping initial sign-up minimal and deferring
non-critical profile data.

**Why this priority**: Drivers and merchants are the supply side of the
marketplace. Without them, passengers have no rides to book.

**Independent Test**: A driver can register, verify their email, and reach the
driver availability screen. A merchant can register, verify their email, and
reach the merchant dashboard — each independently of the other role.

**Acceptance Scenarios**:

1. **Given** the Driver App registration screen, **When** a new driver submits
   their name, email, password, and phone number, **Then** an account with the
   `driver` role is created and a verification email is sent.
2. **Given** the Merchant App registration screen, **When** a new merchant
   submits their name, email, password, and phone number and selects their
   licensing tier (licensed or unlicensed), **Then** an account with the
   `merchant` role is created and a verification email is sent.
3. **Given** a registered driver or merchant, **When** they complete email
   verification, **Then** they are routed to their role-specific home screen
   with a prompt to complete profile setup.

---

### User Story 5 - Re-sending Verification Email (Priority: P3)

A user who did not receive or lost their verification email can request it to be
resent.

**Why this priority**: Email delivery failures are common. Without resend
capability, users are permanently blocked from verifying.

**Independent Test**: A user with an unverified account can request a new
verification email and use it to verify their account.

**Acceptance Scenarios**:

1. **Given** a user who signed up but whose email was not verified, **When**
   they attempt to sign in, **Then** they are shown a notice that their email is
   unverified with a "Resend verification email" option.
2. **Given** a resend request, **When** there has been no resend in the last 60
   seconds, **Then** a new verification email is sent. If within the cooldown
   period, the user is told how long to wait.

---

### Edge Cases

- What happens when a verification link expires before it is clicked? The user
  is shown a clear expiry message with a one-click option to re-send.
- What if a user registers on web and then tries to sign in on mobile with the
  same account? Sessions are cross-platform; the user signs in normally on any
  app.
- What if a user registers with an email that is later found to violate content
  policy? The admin suspension flow (out of scope for this spec) handles
  deactivation; this spec only handles initial creation.
- What if the verification email is sent but the user's email provider bounces
  it? The system records the failure. The user can request a resend; the system
  notifies an admin of a hard bounce.
- What happens on sign-in when the account is suspended? The user receives a
  "Your account has been suspended" message with a support contact — no session
  is created.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow any visitor to register a new account by
  providing a full name, email address, and password.
- **FR-002**: System MUST assign each new account a role at registration:
  `passenger`, `driver`, or `merchant`. Role determines the home screen and
  available features after sign-in.
- **FR-003**: System MUST send a verification email to the registered address
  immediately after account creation.
- **FR-004**: System MUST require email verification before granting access to
  any authenticated feature. Unverified users attempting to sign in MUST be
  shown a verification prompt.
- **FR-005**: System MUST allow users to request a resend of the verification
  email, subject to a 60-second rate limit per account.
- **FR-006**: Verification links MUST expire after 24 hours. Expired links MUST
  show a clear message with an option to request a new link.
- **FR-007**: System MUST authenticate users via email and password (no SSO or
  social login in Phase 1).
- **FR-008**: System MUST enforce a password minimum length of 8 characters;
  inline validation MUST prevent submission of non-compliant passwords before a
  server round-trip.
- **FR-009**: System MUST temporarily lock an account after 5 consecutive failed
  login attempts. The lockout duration MUST be a named constant. The user MUST
  be informed of the lockout and when it expires.
- **FR-010**: Sign-in MUST route the user to the correct role-specific home
  screen: passengers to the booking screen, drivers to the availability screen,
  merchants to the dashboard.
- **FR-011**: Sessions MUST persist across app restarts for a configurable
  maximum duration (default: 30 days). After expiry the user is returned to the
  sign-in screen.
- **FR-012**: Sign-out MUST invalidate all active sessions for the user across
  all devices.
- **FR-013**: System MUST allow a verified user to initiate a password reset via
  their registered email. The reset link MUST expire after 1 hour.
- **FR-014**: Password reset links MUST be single-use: once used or expired, the
  link MUST be rejected if presented again.
- **FR-015**: Completing a password reset MUST invalidate all existing sessions
  for that account.
- **FR-016**: All authentication endpoints (register, sign-in, resend, password
  reset request) MUST be rate-limited to prevent brute-force and enumeration
  attacks.
- **FR-017**: Error responses on registration, sign-in, and password reset MUST
  never reveal whether a specific email address exists in the system (to prevent
  account enumeration).
- **FR-018**: The `merchant` registration flow MUST capture the intended
  licensing tier (`licensed` or `unlicensed`) at sign-up and persist it on the
  merchant record.

### Key Entities

- **User**: The core account record. Holds identity (name, email), role
  (`passenger` | `driver` | `merchant`), verification status, lockout state, and
  timestamps.
- **Session**: A tokenised authentication credential tied to a user and device.
  Has an expiry time and can be individually revoked.
- **PasswordResetToken**: A time-limited, single-use token linked to a user
  account, used to authorise a password change.
- **EmailVerificationToken**: A time-limited token sent to the user's email
  address at registration and on resend requests.

### Assumptions

- Phone number is collected at registration for drivers and merchants (needed
  for dispatch communications) but is optional for passengers at sign-up;
  passengers can add it later.
- Profile photo, preferred payment method, and other enrichment data are
  deferred to post-verification onboarding flows, not collected at registration.
- Social / SSO login methods (Google, Apple) are deferred to a future phase.
- Admin-triggered account suspension and deactivation are out of scope for this
  spec.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new passenger can complete the full registration and email
  verification flow in under 3 minutes on a mid-range Android device.
- **SC-002**: 95% of verification emails are delivered and opened within 5
  minutes of registration (measured over rolling 7-day window).
- **SC-003**: Sign-in for a returning user with cached credentials takes under 2
  seconds from tap to home screen.
- **SC-004**: Zero successful brute-force logins against test accounts when
  automated tools are run against the sign-in endpoint (validated during
  security review).
- **SC-005**: Password reset flow — from "Forgot password?" tap to being signed
  in with a new password — completes in under 4 minutes.
- **SC-006**: First-time sign-in success rate of ≥ 90% for users who completed
  registration (i.e., fewer than 10% of new users require support to access
  their account).
