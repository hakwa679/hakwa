import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(packageDir, "../..");
const envFilePaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(workspaceDir, ".env"),
  path.resolve(workspaceDir, "api/.env"),
  path.resolve(packageDir, ".env"),
];

if (!process.env.DATABASE_URL) {
  const existingEnvFiles = [...new Set(envFilePaths)].filter((filePath) =>
    existsSync(filePath),
  );

  if (existingEnvFiles.length > 0) {
    loadEnv({ path: existingEnvFiles, quiet: true });
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    `DATABASE_URL is not set. Checked: ${envFilePaths.join(", ")}`,
  );
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle({ client: sql });
export default db;
