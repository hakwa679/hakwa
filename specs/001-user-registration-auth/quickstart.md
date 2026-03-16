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
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
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
    return next(new RateLimitError("RESEND_COOLDOWN", "Wait 60 seconds before resending."));
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

```ts
import { redis } from "@hakwa/redis";
import { AUTH_LOCKOUT_MAX_ATTEMPTS, AUTH_LOCKOUT_DURATION_SECONDS } from "@hakwa/core";
import { RateLimitError } from "@hakwa/errors";

export async function checkLockout(email: string) {
  const key = `auth:lockout:${email}`;
  const attempts = await redis.get(key);
  if (Number(attempts) >= AUTH_LOCKOUT_MAX_ATTEMPTS) {
    throw new RateLimitError("ACCOUNT_LOCKED", "Account temporarily locked. Try again later.");
  }
}

export async function recordFailedAttempt(email: string) {
  const key = `auth:lockout:${email}`;
  await redis.multi()
    .incr(key)
    .expire(key, AUTH_LOCKOUT_DURATION_SECONDS)
    .exec();
}

export async function clearLockout(email: string) {
  await redis.del(`auth:lockout:${email}`);
}
```

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
```

---

## Step 6 — Verify End-to-End

1. Register: `POST /auth/sign-up/email` → check email for verification link.
2. Click link → account marked verified.
3. Sign in: `POST /auth/sign-in/email` → receive session token.
4. Call `GET /api/auth/session` with Bearer token → receive user profile.
5. Sign out: `POST /auth/sign-out` → session invalidated.
6. Attempt sign-in 3× with wrong password → `429 ACCOUNT_LOCKED`.
