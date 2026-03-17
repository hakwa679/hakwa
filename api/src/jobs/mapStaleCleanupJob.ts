import db from "@hakwa/db";
import { mapFeature } from "@hakwa/db/schema";
import { MAP_PENDING_STALE_DAYS } from "@hakwa/core";
import { and, eq, lt, sql } from "drizzle-orm";
import { invalidateMapActiveLayerCache } from "../services/mapRedisService.ts";

export async function runMapStaleCleanup(): Promise<number> {
  const staleBefore = new Date(
    Date.now() - MAP_PENDING_STALE_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .update(mapFeature)
    .set({
      status: "stale",
      staleAt: new Date(),
    })
    .where(
      and(
        eq(mapFeature.status, "pending"),
        lt(mapFeature.createdAt, staleBefore),
        sql`(${mapFeature.confirmCount} + ${mapFeature.disputeCount}) < 2`,
      ),
    )
    .returning({ id: mapFeature.id });

  if (rows.length > 0) {
    await invalidateMapActiveLayerCache();
  }

  return rows.length;
}
