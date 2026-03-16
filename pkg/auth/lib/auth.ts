import db from "@hakwa/db";
import {
  notificationPreference,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
} from "@hakwa/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sendEmail } from "@hakwa/email";

const auth = betterAuth({
  secret: process.env["BETTER_AUTH_SECRET"]!,
  baseUrl: process.env["BETTER_AUTH_URL"]!,
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    storage: "database",
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        html: `<p>Please verify your email by clicking the following link: <a href="${url}">Click here</a></p>`,
      });
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser: { id: string }) => {
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
        },
      },
    },
  },
});

export { auth };
export default auth;
