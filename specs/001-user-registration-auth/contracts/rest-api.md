# REST API Contract: User Registration & Authentication

**Feature**: 001-user-registration-auth  
**Base path**: `/auth` (Better Auth handler) + `/api/auth` (custom extensions)  
**Auth**: Better Auth session cookie (web) / Bearer token (mobile)

---

> **Note**: Most auth endpoints are handled directly by Better Auth's Express
> handler mounted at `/auth/*`. The contracts below describe both the Better
> Auth-owned routes and the thin custom wrappers Hakwa adds.

---

## Better Auth Routes (handled by `authHandler`)

### `POST /auth/sign-up/email`

Register a new account.

**Request body**:

```json
{
  "email": "user@example.com",
  "password": "strongPassword123",
  "name": "Ada Citizen",
  "role": "passenger"
}
```

> `role` is a custom field injected via Better Auth's `customSchema` hook
> (`passenger | driver | merchant`, default `passenger`).

**Response `201`**:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Ada Citizen",
    "role": "passenger",
    "emailVerified": false,
    "createdAt": "ISO8601"
  },
  "session": null
}
```

> Session is `null` until email is verified (Better Auth enforces
> `requireEmailVerification`).

**Errors**:

| Status | Code                   | Condition                      |
| ------ | ---------------------- | ------------------------------ |
| `422`  | `VALIDATION_ERROR`     | Weak password or invalid email |
| `409`  | `EMAIL_ALREADY_IN_USE` | Email already registered       |

---

### `POST /auth/sign-in/email`

Sign in with email and password.

**Request body**:

```json
{
  "email": "user@example.com",
  "password": "strongPassword123"
}
```

**Response `200`**:

```json
{
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "passenger",
    "emailVerified": true
  },
  "session": { "id": "...", "token": "...", "expiresAt": "ISO8601" }
}
```

**Errors**:

| Status | Code                  | Condition                              |
| ------ | --------------------- | -------------------------------------- |
| `401`  | `INVALID_CREDENTIALS` | Wrong email or password                |
| `403`  | `EMAIL_NOT_VERIFIED`  | Account exists but email unverified    |
| `429`  | `ACCOUNT_LOCKED`      | ≥ 3 consecutive failures within window |

---

### `POST /auth/sign-out`

Invalidate the current session (and all sessions on explicit full sign-out).

**Request headers**: `Authorization: Bearer <token>` (mobile) or session cookie
(web)

**Response `200`**: `{ "success": true }`

---

### `POST /auth/verify-email`

**Query parameter**: `?token=<verification-token>` (from email link)

**Response `200`**: Redirects to app deep-link or web home on success.

**Errors**:

| Status | Code            | Condition                       |
| ------ | --------------- | ------------------------------- |
| `400`  | `INVALID_TOKEN` | Token not found or already used |
| `400`  | `TOKEN_EXPIRED` | Verification link has expired   |

---

### `POST /auth/forgot-password`

Request a password reset email.

**Request body**: `{ "email": "user@example.com" }`

**Response `200`**: Always `{ "success": true }` — no account-enumeration leak.

---

### `POST /auth/reset-password`

Set a new password using a reset token.

**Request body**:

```json
{
  "token": "<reset-token-from-email>",
  "newPassword": "newStrongPassword456"
}
```

**Response `200`**: `{ "success": true }` — all sessions revoked, user signed in
with new session.

**Errors**:

| Status | Code            | Condition                         |
| ------ | --------------- | --------------------------------- |
| `400`  | `INVALID_TOKEN` | Token not found, expired, or used |
| `422`  | `WEAK_PASSWORD` | New password fails strength check |

---

## Custom Routes (thin wrappers)

### `POST /api/auth/resend-verification`

Resend the verification email. Enforces a 60-second cooldown per user.

**Auth**: Unauthenticated (user may not have a session yet).

**Request body**: `{ "email": "user@example.com" }`

**Response `200`**: `{ "success": true }`

**Errors**:

| Status | Code              | Condition                                          |
| ------ | ----------------- | -------------------------------------------------- |
| `429`  | `RESEND_COOLDOWN` | A resend was issued less than 60 seconds ago       |
| `404`  | Hidden (generic)  | Unknown email — returns 200 to prevent enumeration |

---

### `GET /api/auth/session`

Get the current session and user object (used on app launch for restoration).

**Auth**: Required (session token / cookie).

**Response `200`**:

```json
{
  "user": { "id": "...", "email": "...", "name": "...", "role": "passenger" },
  "session": { "id": "...", "expiresAt": "ISO8601" }
}
```

**Errors**:

| Status | Code           | Condition              |
| ------ | -------------- | ---------------------- |
| `401`  | `UNAUTHORIZED` | No valid session found |
