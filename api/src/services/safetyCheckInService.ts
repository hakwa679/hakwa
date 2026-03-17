import db from "@hakwa/db";
import { safetyCheckIn } from "@hakwa/db/schema";
import { and, eq } from "drizzle-orm";

export async function respondToSafetyCheckIn(input: {
  userId: string;
  checkInId: string;
  response: "ok" | "cancel";
}) {
  const [row] = await db
    .select({
      id: safetyCheckIn.id,
      userId: safetyCheckIn.userId,
      status: safetyCheckIn.status,
    })
    .from(safetyCheckIn)
    .where(eq(safetyCheckIn.id, input.checkInId))
    .limit(1);

  if (!row || row.userId !== input.userId) {
    throw new Error("SAFETY_CHECK_IN_NOT_FOUND");
  }

  if (row.status !== "pending") {
    throw new Error("SAFETY_CHECK_IN_ALREADY_RESOLVED");
  }

  const status = input.response === "ok" ? "ok_confirmed" : "cancelled";

  await db
    .update(safetyCheckIn)
    .set({
      status,
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(safetyCheckIn.id, input.checkInId),
        eq(safetyCheckIn.userId, input.userId),
      ),
    );

  return { id: input.checkInId, status };
}
