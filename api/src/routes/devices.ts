import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import db from "@hakwa/db";
import { device } from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";
import { DeviceRegistrationSchema } from "@hakwa/notifications";

export const deviceRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/devices — register a push token for the authenticated user
// ---------------------------------------------------------------------------

deviceRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const session = await getSessionFromRequest(req);

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = DeviceRegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { pushToken, platform } = parsed.data;

  // Upsert — but do NOT re-activate a deactivated token (T016 spec)
  // A deactivated token means the device unregistered from EPN — new tokens
  // will come in via a separate POST with a different pushToken value.
  const existing = await db
    .select({ id: device.id, active: device.active })
    .from(device)
    .where(eq(device.pushToken, pushToken))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    // Touch updatedAt for existing active tokens; refuse to re-activate
    if (row.active) {
      await db
        .update(device)
        .set({ updatedAt: new Date() })
        .where(eq(device.id, row.id));
    }
    res.status(200).json({ id: row.id });
    return;
  }

  const [inserted] = await db
    .insert(device)
    .values({
      userId: session.user.id,
      pushToken,
      platform,
      active: true,
    })
    .returning({ id: device.id });

  res.status(201).json({ id: inserted!.id });
});

// ---------------------------------------------------------------------------
// DELETE /api/devices/:id — deactivate (soft-delete) a push token
// ---------------------------------------------------------------------------

deviceRouter.delete(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Missing device id" });
      return;
    }

    const [row] = await db
      .select({ id: device.id, userId: device.userId })
      .from(device)
      .where(eq(device.id, String(id)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    if (row.userId !== session.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db
      .update(device)
      .set({ active: false })
      .where(and(eq(device.id, String(id)), eq(device.userId, String(session.user.id))));

    res.status(204).send();
  },
);
