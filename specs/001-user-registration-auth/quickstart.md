# Quickstart: User Registration & Authentication

_Phase 1 output for `001-user-registration-auth`_

This guide covers wiring up Better Auth end-to-end: schema extension, server
setup, email delivery, and mobile session persistence.

---

## Prerequisites

1. PostgreSQL running; `DATABASE_URL` set in `.env`.
2. Redis running; `REDIS_URL` set in `.env`.
3. `npm install` from repo root (workspace packages resolved).
4. SMTP credentials available — `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`,
   `MAIL_PASS` in `.env`.

---

## Step 1 — Extend the Schema

Add `role`, `phone`, `isLocked`, `lockedUntil`, and `lastLoginAt` columns to
`user`, and create the `user_profile` table.

Edit `pkg/db/schema/auth-schema.ts`:

```ts
export const user = pgTable("user", {
  // ... existing columns ...
  role: text("role").notNull().default("passenger"),
  phone: varchar("phone", { length: 30 }),
  isLocked: boolean("is_locked").notNull().default(false),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
});

export const userProfile = pgTable("user_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

Run the schema push:

```bash
npm run db-push
```

---

## Step 2 — Configure Better Auth

Ensure `pkg/auth/lib/auth.ts` has `requireEmailVerification: true` and the
custom `role` field exposed:

```ts
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseUrl: process.env.BETTER_AUTH_URL!,
  rateLimit: { windowMs: 15 * 60 * 1000, max: 100, storage: "database" },
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your Hakwa account",
        html: `<p>Click to verify: <a href="${url}">Verify email</a></p>`,
      });
    },
    expiresIn: 60 * 60 * 24, // 24 hours
  },
  // Expose role field to session
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "passenger" },
      phone: { type: "string", required: false },
    },
  },
});
```

---

## Step 3 — Mount Auth Routes in the API

In `api/src/index.ts`:

```ts
import { registerAuthRoutes } from "@hakwa/auth";
import express from "express";

const app = express();
registerAuthRoutes(app); // mounts /auth/* handler
```

Add the custom resend-verification route:

```ts
// api/src/routes/auth.ts
import { Router } from "express";
import { redis } from "@hakwa/redis";

const router = Router();

router.post("/resend-verification", async (req, res, next) => {
  const { email } = req.body;
  const cooldownKey = `resend:${email}`;
  const locked = await redis.get(cooldownKey);
  if (locked) {
    return next(
      new RateLimitError(
        "RESEND_COOLDOWN",
        "Wait 60 seconds before resending.",
      ),
    );
  }
  await redis.set(cooldownKey, "1", "EX", 60);
  // delegate to Better Auth resend API
  await auth.api.sendVerificationEmail({ email });
  res.json({ success: true });
});

export default router;
```

---

## Step 4 — Account Lockout Middleware

Add lockout tracking in `api/src/middleware/lockout.ts`:

````ts
import { redis } from "@hakwa/redis";
import {
  AUTH_LOCKOUT_MAX_ATTEMPTS,
  AUTH_LOCKOUT_DURATION_SECONDS,
} from "@hakwa/core";
import { RateLimitError } from "@hakwa/errors";

export async function checkLockout(email: string) {
  const key = `auth:lockout:${email}`;
  const attempts = await redis.get(key);
  if (Number(attempts) >= AUTH_LOCKOUT_MAX_ATTEMPTS) {
    throw new RateLimitError(
      "ACCOUNT_LOCKED",
      "Account temporarily locked. Try again later.",
    );
  }
}

export async function recordFailedAttempt(email: string) {
  const key = `auth:lockout:${email}`;
  await redis
    .multi()
    .incr(key)
    .expire(key, AUTH_LOCKOUT_DURATION_SECONDS)
    .exec();
}

---

## E2E Smoke Test — Manual Verification Steps (T045)

Run these steps after deploying (or locally with `npm run dev` in both `api/`
and `apps/web/`).

### 1 — Passenger registration

```bash
curl -s -X POST http://localhost:3000/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Passenger","email":"passenger@example.com","password":"Test1234!","role":"passenger"}' \
  | jq .
# Expect: { "user": { "role": "passenger", ... }, "session": null }
````

### 2 — Email verification

- Open the verification email in your SMTP preview tool (e.g. Mailpit at
  `http://localhost:8025`).
- Click the verification link → it opens the web portal at
  `http://localhost:5173/auth/verify-email?token=<token>`.
- Page should show "Email verified! You can now sign in."

### 3 — Sign in

```bash
curl -s -X POST http://localhost:3000/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"passenger@example.com","password":"Test1234!"}' \
  | jq .
# Expect: { "token": "...", "user": { ... }, "session": { ... } }
```

### 4 — Session restore

```bash
TOKEN="<token from step 3>"
curl -s http://localhost:3000/api/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  | jq .
# Expect: { "user": { "email": "passenger@example.com", ... }, "session": { ... } }
```

### 5 — Resend verification (cooldown)

```bash
# With an unverified account:
curl -s -X POST http://localhost:3000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"unverified@example.com"}' \
  | jq .
# First call: 200 { "success": true }
# Second call within 60 s: 429 { "code": "RESEND_COOLDOWN" }
```

### 6 — Lockout after failed attempts

```bash
for i in 1 2 3 4 5 6; do
  curl -s -X POST http://localhost:3000/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"passenger@example.com","password":"WrongPass!"}' \
    | jq '.error // .code'
done
# After max attempts: 429 { "code": "ACCOUNT_LOCKED", "retryAfter": <seconds> }
```

### 7 — Password reset

```bash
curl -s -X POST http://localhost:3000/auth/forget-password \
  -H "Content-Type: application/json" \
  -d '{"email":"passenger@example.com","redirectTo":"http://localhost:5173/auth/reset-password"}' \
  | jq .
# Expect: 200 { "success": true }  (always, even for unknown emails)
```

Open the reset email, click the link, set a new password, and verify sign-in
works with the new password.

### 8 — Driver & merchant registration

Repeat steps 1–4 with `"role":"driver"` and `"role":"merchant"` respectively.
Confirm the `role` field is persisted correctly in the `user` table.

---

**All steps passing** → Feature `001-user-registration-auth` is complete and
deployed correctly.

export async function clearLockout(email: string) { await
redis.del(`auth:lockout:${email}`); }

````

---

## Step 5 — Mobile Session Persistence

In each Expo app's root layout (`apps/mobile/*/app/_layout.tsx`):

```ts
import * as SecureStore from "expo-secure-store";
import { useApiClient } from "@hakwa/api-client";

const SESSION_KEY = "hakwa_session_token";

export async function restoreSession() {
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  if (!token) return null;
  return apiClient.get("/api/auth/session", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function persistSession(token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
````

---

## Step 6 — Verify End-to-End

1. Register: `POST /auth/sign-up/email` → check email for verification link.
2. Click link → account marked verified.
3. Sign in: `POST /auth/sign-in/email` → receive session token.
4. Call `GET /api/auth/session` with Bearer token → receive user profile.
5. Sign out: `POST /auth/sign-out` → session invalidated.
6. Attempt sign-in 3× with wrong password → `429 ACCOUNT_LOCKED`.
