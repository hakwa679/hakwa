import cron from "node-cron";
import { expireTripShares } from "../services/safetyShareService.ts";

export async function runTripShareExpiryJob(now = new Date()): Promise<number> {
  return expireTripShares(now);
}

export function registerTripShareExpiryCron(): void {
  cron.schedule("*/5 * * * *", () => {
    runTripShareExpiryJob().catch((error: unknown) => {
      console.error("[cron] trip share expiry failed", { error });
    });
  });
}
