import { Router, type Request, type Response } from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import db from "@hakwa/db";
import { safetyIncident } from "@hakwa/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notifyReporterOnResolution } from "../../services/safetyIncidentService.ts";

export const adminSafetyRouter = Router();

async function requireSafetyAdmin(
  req: Request,
  res: Response,
): Promise<boolean> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return false;
  }

  if (session.user.role !== "safety_admin" && session.user.role !== "admin") {
    res
      .status(403)
      .json({ code: "FORBIDDEN", message: "Safety admin required." });
    return false;
  }

  return true;
}

adminSafetyRouter.get("/incidents", async (req, res) => {
  const allowed = await requireSafetyAdmin(req, res);
  if (!allowed) return;

  const items = await db
    .select({
      id: safetyIncident.id,
      referenceCode: safetyIncident.referenceCode,
      type: safetyIncident.type,
      category: safetyIncident.category,
      status: safetyIncident.status,
      createdAt: safetyIncident.createdAt,
    })
    .from(safetyIncident)
    .where(inArray(safetyIncident.status, ["active", "open"]))
    .orderBy(asc(safetyIncident.createdAt))
    .limit(100);

  res.status(200).json({ items });
});

adminSafetyRouter.patch("/incidents/:id", async (req, res) => {
  const allowed = await requireSafetyAdmin(req, res);
  if (!allowed) return;

  const incidentId = String(req.params["id"] ?? "");
  const status = String(req.body?.status ?? "resolved") as
    | "resolved"
    | "acknowledged"
    | "unsubstantiated"
    | "driver_actioned";

  await db
    .update(safetyIncident)
    .set({ status, resolvedAt: status === "acknowledged" ? null : new Date() })
    .where(and(eq(safetyIncident.id, incidentId)));

  if (status !== "acknowledged") {
    await notifyReporterOnResolution({ incidentId, status: status as any });
  }

  res.status(200).json({ updated: true, status });
});
