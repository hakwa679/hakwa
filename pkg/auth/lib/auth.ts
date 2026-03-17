import db from "@hakwa/db";
import { user as userTable } from "@hakwa/db/schema";
import {
  notificationPreference,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
} from "@hakwa/db/schema";
import { betterAuth } from "better-auth";
import { sendEmail } from "@hakwa/email";
import { redis } from "@hakwa/redis";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const auth = betterAuth({
  secret: process.env["BETTER_AUTH_SECRET"]!,
  baseURL: process.env["BETTER_AUTH_URL"]!,
  rateLimit: {
    window: 15 * 60,
    max: 100,
    storage: "database",
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async (email: string, url: string) => {
      await sendEmail({
        to: email,
        subject: "Verify your email",
        html: `<p>Please verify your email by clicking the following link: <a href="${url}">Click here</a></p>`,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "passenger",
        input: true,
      },
      phone: {
        type: "string",
        required: false,
        defaultValue: null,
        input: true,
      },
      isLocked: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      lockedUntil: {
        type: "date",
        required: false,
        defaultValue: null,
        input: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (
          newUser: { id: string },
          context: { body?: Record<string, unknown> } | null,
        ) => {
          // Seed 16 types × 4 channels = 64 notification preference rows
          const rows = NOTIFICATION_TYPES.flatMap((type) =>
            NOTIFICATION_CHANNELS.map((channel) => ({
              userId: newUser.id,
              type,
              channel,
              enabled: true,
            })),
          );
          await db
            .insert(notificationPreference)
            .values(rows)
            .onConflictDoNothing();

          const maybeReferralCode = context?.body?.["referralCode"];
          if (
            typeof maybeReferralCode === "string" &&
            maybeReferralCode.trim().length > 0
          ) {
            await redis.xadd(
              "gamification:events",
              "*",
              "type",
              "referral_used",
              "userId",
              newUser.id,
              "referralCode",
              maybeReferralCode.trim().toUpperCase(),
              "timestamp",
              new Date().toISOString(),
            );
          }
        },
      },
    },
    session: {
      create: {
        after: async (newSession: { userId: string }) => {
          // Update lastLoginAt on every new session (sign-in)
          await db
            .update(userTable)
            .set({ lastLoginAt: new Date() })
            .where(eq(userTable.id, newSession.userId));
        },
      },
    },
  },
});

export { auth };
export default auth;
