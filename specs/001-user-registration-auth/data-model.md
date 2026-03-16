# Data Model: User Registration & Authentication

**Feature**: 001-user-registration-auth  
**Schema file**: `pkg/db/schema/auth-schema.ts` (extended)  
**Last updated**: 2026-03-17

---

## Overview

Better Auth owns the core identity tables (`user`, `session`, `account`,
`verification`). These are already defined in `pkg/db/schema/auth-schema.ts` via
the Drizzle adapter. This feature adds two columns to `user` and introduces a
`userProfile` table for extended account state.

---

## Changes to Existing Tables

### `user` — additive columns

| New Column    | Type          | Constraint                                     | Notes                                                 |
| ------------- | ------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `role`        | `text`        | NOT NULL, default `'passenger'`, CHECK in enum | `'passenger' \| 'driver' \| 'merchant'`               |
| `phone`       | `varchar(30)` | nullable                                       | Captured at registration for drivers & merchants      |
| `isLocked`    | `boolean`     | NOT NULL, default `false`                      | Set true when lockout threshold exceeded              |
| `lockedUntil` | `timestamp`   | nullable                                       | Null = not locked. Checked before Better Auth sign-in |
| `lastLoginAt` | `timestamp`   | nullable                                       | Updated on successful sign-in                         |

> **Migration note**: Adding `role` with a `DEFAULT` is a safe, non-breaking
> migration. Existing test rows become `passenger` automatically.

---

## New Tables

### `userProfile`

Extended account state that is role-agnostic but not housed in the auth library.
Onboarding completion state lives here so auth and onboarding remain decoupled.

```
user_profile
├── id                  uuid        PK, random
├── userId              text        UNIQUE NOT NULL, FK → user.id ON DELETE CASCADE
├── onboardingComplete  boolean     NOT NULL default false
├── avatarUrl           text        nullable — CDN URL of profile photo
├── createdAt           timestamp   NOT NULL default now()
└── updatedAt           timestamp   NOT NULL default now(), $onUpdate
```

**Indexes**:

- UNIQUE on `userId` (one profile per user).

**Relations**: one-to-one with `user`.

---

## Existing Tables (referenced, not changed)

### `session`

| Column      | Type        | Notes                                    |
| ----------- | ----------- | ---------------------------------------- |
| `id`        | `text`      | PK                                       |
| `token`     | `text`      | UNIQUE — stored by mobile in SecureStore |
| `expiresAt` | `timestamp` |                                          |
| `userId`    | `text`      | FK → `user.id`                           |
| `ipAddress` | `text`      | nullable                                 |
| `userAgent` | `text`      | nullable                                 |

### `verification`

Used by Better Auth for email verification tokens and password reset tokens.
`identifier` = email address. `value` = hashed token. `expiresAt` enforces
time-limited links.

---

## Schema Relationships

```
user ──────────────────── session (1:many)
user ──────────────────── account (1:many, OAuth providers)
user ──────────────────── verification (1:many, tokens)
user ──────────────────── userProfile (1:1)
```

---

## Role Enum Values

| Value       | Description                                               |
| ----------- | --------------------------------------------------------- |
| `passenger` | Default role. Access to Rider App and Rider Web Portal.   |
| `driver`    | Operator role. Access to Driver App.                      |
| `merchant`  | Merchant/fleet owner role. Access to Merchant App/Portal. |
