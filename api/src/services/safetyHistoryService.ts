import db from "@hakwa/db";
import { safetyCheckIn, safetyIncident, trip } from "@hakwa/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function listSafetyHistory(userId: string, limit = 20) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const incidents = await db
    .select({
      id: safetyIncident.id,
      referenceCode: safetyIncident.referenceCode,
      type: safetyIncident.type,
      category: safetyIncident.category,
      status: safetyIncident.status,
      resolutionOutcome: safetyIncident.resolutionNotes,
      createdAt: safetyIncident.createdAt,
    })
    .from(safetyIncident)
    .where(eq(safetyIncident.reporterId, userId))
    .orderBy(desc(safetyIncident.createdAt))
    .limit(safeLimit);

  const trips = await db
    .select({ id: trip.id })
    .from(trip)
    .where(and(eq(trip.passengerId, userId)));

  const tripIds = trips.map((row) => row.id);
  const checkIns = tripIds.length
    ? await db
        .select({
          id: safetyCheckIn.id,
          type: safetyCheckIn.type,
          status: safetyCheckIn.status,
          createdAt: safetyCheckIn.createdAt,
        })
        .from(safetyCheckIn)
        .where(inArray(safetyCheckIn.tripId, tripIds))
        .orderBy(desc(safetyCheckIn.createdAt))
        .limit(safeLimit)
    : [];

  return {
    incidents,
    checkIns,
    page: {
      limit: safeLimit,
      hasMore: incidents.length >= safeLimit,
    },
  };
}
