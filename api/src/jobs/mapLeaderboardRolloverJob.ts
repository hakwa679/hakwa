import cron from "node-cron";
import { archiveAndResetMonthlyLeaderboard } from "../services/mapLeaderboardService.ts";

export async function runMapLeaderboardRolloverJob(
  date = new Date(),
): Promise<{ archivedFrom: string; archivedTo: string; moved: number }> {
  return archiveAndResetMonthlyLeaderboard(date);
}

export function registerMapLeaderboardRolloverCron(): void {
  // Monthly rollover at 00:05 UTC on day 1.
  cron.schedule("5 0 1 * *", () => {
    runMapLeaderboardRolloverJob().catch((error: unknown) => {
      console.error("[cron] map leaderboard rollover failed", { error });
    });
  });
}
