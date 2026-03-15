import db from "@hakwa/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseUrl: process.env.BETTER_AUTH_URL!,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    storage: "database",
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
