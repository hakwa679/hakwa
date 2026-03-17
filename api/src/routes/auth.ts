import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { user as userTable } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { getSessionFromRequest } from "@hakwa/auth";
import auth from "@hakwa/auth";

export const authRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/auth/session
// Restore session on mobile app launch — returns user + session for a valid
// Bearer token or session cookie. Used by all three mobile apps.
// ---------------------------------------------------------------------------
authRouter.get(
  "/session",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as Record<string, unknown>)["role"] ?? "passenger",
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// Re-send email verification with a 60-second per-email cooldown.
// Always returns 200 regardless of whether the email is registered
// (account enumeration prevention).
// ---------------------------------------------------------------------------
authRouter.post(
  "/resend-verification",
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as unknown;
    const email =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>)["email"] === "string"
        ? ((body as Record<string, unknown>)["email"] as string)
            .toLowerCase()
            .trim()
        : null;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    // Cooldown check — prevents spam, doesn't leak account existence
    const cooldownKey = `auth:resend_cooldown:${email}`;
    const cooldown = await redis.get(cooldownKey);
    if (cooldown !== null) {
      res.status(429).json({ error: "RESEND_COOLDOWN" });
      return;
    }

    // Look up user — but do NOT reveal whether they exist in the response
    const [existingUser] = await db
      .select({ id: userTable.id, emailVerified: userTable.emailVerified })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existingUser && !existingUser.emailVerified) {
      // Send verification email via Better Auth
      await auth.api.sendVerificationEmail({ body: { email } });
    }

    // Always set the cooldown key so timing cannot reveal account existence
    await redis.set(cooldownKey, "1", "EX", 60);

    res.json({ success: true });
  },
);
