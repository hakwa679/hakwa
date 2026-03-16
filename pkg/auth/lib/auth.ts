import db from "@hakwa/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sendEmail } from "@hakwa/email";

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseUrl: process.env.BETTER_AUTH_URL!,
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
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        html: `<p>Please verify your email by clicking the following link: <a href="${url}">Click here</a></p>`,
      });
    },
  },
});

export { auth };
export default auth;
