import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import db from "@hakwa/db";
import { getSessionFromRequest } from "@hakwa/auth";
import { trip } from "@hakwa/db/schema";
import { and, eq, or } from "drizzle-orm";
import { generateSafetyCode } from "@hakwa/core";
import { triggerSOS } from "../services/safetyService.ts";
import {
  createOrRotateTripShare,
  getPublicTripShare,
  revokeTripShare,
} from "../services/safetyShareService.ts";
import {
  addSafetyContact,
  deleteSafetyContact,
  listSafetyContacts,
  sendSafetyTestAlert,
} from "../services/safetyContactsService.ts";
import {
  createEvidenceUploadRequest,
  fileSafetyIncident,
} from "../services/safetyIncidentService.ts";
import { listSafetyHistory } from "../services/safetyHistoryService.ts";
import { respondToSafetyCheckIn } from "../services/safetyCheckInService.ts";
import { createRateLimit } from "../middleware/rateLimit.ts";

export const safetyRouter = Router();
const sosRateLimit = createRateLimit({
  prefix: "safety:sos:ratelimit",
  max: 10,
  windowSeconds: 60,
});
const testAlertRateLimit = createRateLimit({
  prefix: "safety:test-alert:ratelimit",
  max: 5,
  windowSeconds: 60,
});

async function requireAuth(
  req: Request,
  res: Response,
): Promise<string | null> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return null;
  }
  return session.user.id;
}

function todo(
  _req: Request,
  res: Response,
  _next: NextFunction,
  message: string,
): void {
  res.status(501).json({ code: "NOT_IMPLEMENTED", message });
}

// Contacts
safetyRouter.get("/contacts", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const items = await listSafetyContacts(userId);
    res.status(200).json({ items });
  } catch (error) {
    next(error);
  }
});

safetyRouter.post("/contacts", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const created = await addSafetyContact({
      userId,
      name: String(req.body?.name ?? ""),
      phone: String(req.body?.phone ?? ""),
      label: typeof req.body?.label === "string" ? req.body.label : undefined,
    });
    res.status(201).json(created);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SAFETY_CONTACT_LIMIT_REACHED"
    ) {
      res.status(409).json({
        code: "SAFETY_CONTACT_LIMIT_REACHED",
        message: "Maximum of 3 active contacts reached.",
      });
      return;
    }
    next(error);
  }
});

safetyRouter.delete("/contacts/:contactId", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const contactId = String(req.params["contactId"] ?? "");
    const result = await deleteSafetyContact(userId, contactId);
    res.status(200).json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SAFETY_CONTACT_NOT_FOUND"
    ) {
      res.status(404).json({
        code: "SAFETY_CONTACT_NOT_FOUND",
        message: "Contact not found.",
      });
      return;
    }
    next(error);
  }
});

safetyRouter.post(
  "/contacts/test-alert",
  testAlertRateLimit,
  async (req, res, next) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    try {
      const result = await sendSafetyTestAlert(userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// SOS
safetyRouter.post("/sos", sosRateLimit, async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const tripId =
      typeof req.body?.tripId === "string"
        ? (req.body.tripId as string)
        : undefined;
    const silent = req.body?.silent === true;
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);

    const result = await triggerSOS({
      userId,
      silent,
      ...(tripId ? { tripId } : {}),
      ...(Number.isFinite(lat) && Number.isFinite(lng)
        ? { location: { lat, lng } }
        : {}),
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_NO_ACTIVE_TRIP") {
      res.status(422).json({
        code: "SAFETY_NO_ACTIVE_TRIP",
        message: "No active trip was found for SOS.",
      });
      return;
    }

    next(error);
  }
});

safetyRouter.post("/sos/:incidentId/acknowledge", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T040: acknowledge SOS");
});

// Trip sharing
safetyRouter.post("/trips/:tripId/share", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const tripId = String(req.params["tripId"] ?? "");
    const created = await createOrRotateTripShare(userId, tripId);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_INVALID_TRIP") {
      res
        .status(422)
        .json({ code: "SAFETY_INVALID_TRIP", message: "Invalid trip." });
      return;
    }
    next(error);
  }
});

safetyRouter.delete("/trips/:tripId/share", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const tripId = String(req.params["tripId"] ?? "");
    const result = await revokeTripShare(userId, tripId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_INVALID_TRIP") {
      res
        .status(422)
        .json({ code: "SAFETY_INVALID_TRIP", message: "Invalid trip." });
      return;
    }
    next(error);
  }
});

safetyRouter.get("/share/:token", async (req, res, next) => {
  try {
    const token = String(req.params["token"] ?? "");
    const detail = await getPublicTripShare(token);
    res.status(200).json(detail);
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_SHARE_NOT_FOUND") {
      res
        .status(404)
        .json({ code: "SAFETY_SHARE_NOT_FOUND", message: "Share not found." });
      return;
    }
    if (error instanceof Error && error.message === "SAFETY_SHARE_EXPIRED") {
      res
        .status(410)
        .json({ code: "SAFETY_SHARE_EXPIRED", message: "Share expired." });
      return;
    }
    next(error);
  }
});

safetyRouter.get("/share/:token/stream", async (req, res, next) => {
  try {
    const token = String(req.params["token"] ?? "");
    await getPublicTripShare(token);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const interval = setInterval(() => {
      res.write(`event: location\n`);
      res.write(
        `data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
    }, 5000);

    req.on("close", () => {
      clearInterval(interval);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_SHARE_EXPIRED") {
      res
        .status(410)
        .json({ code: "SAFETY_SHARE_EXPIRED", message: "Share expired." });
      return;
    }
    next(error);
  }
});

// Vehicle verification
safetyRouter.get("/trips/:tripId/verify", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const tripId = String(req.params["tripId"] ?? "");
    const [tripRow] = await db
      .select({
        id: trip.id,
        passengerId: trip.passengerId,
        driverId: trip.driverId,
      })
      .from(trip)
      .where(
        and(
          eq(trip.id, tripId),
          or(eq(trip.passengerId, userId), eq(trip.driverId, userId)),
        ),
      )
      .limit(1);

    if (!tripRow) {
      res
        .status(422)
        .json({ code: "SAFETY_INVALID_TRIP", message: "Invalid trip." });
      return;
    }

    const safetyCode = generateSafetyCode({ bookingId: tripId });
    res.status(200).json({
      safetyCode,
      vehiclePlate: "UNKNOWN",
      vehicleMake: "Unknown",
      vehicleModel: "Unknown",
      vehicleColour: "Unknown",
    });
  } catch (error) {
    next(error);
  }
});

safetyRouter.post("/trips/:tripId/wrong-vehicle", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const tripId = String(req.params["tripId"] ?? "");
    const incident = await fileSafetyIncident({
      userId,
      tripId,
      category: "wrong_vehicle",
      description: "Reported wrong vehicle before boarding.",
    });
    res.status(201).json({ referenceCode: incident.referenceCode });
  } catch (error) {
    next(error);
  }
});

// Incident reporting + history
safetyRouter.post("/incidents/report", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const tripId = String(req.body?.tripId ?? "");
    const category = String(req.body?.category ?? "other");
    const description =
      typeof req.body?.description === "string"
        ? req.body.description
        : undefined;

    const incident = await fileSafetyIncident({
      userId,
      tripId,
      category,
      description,
    });

    res.status(201).json({
      incidentId: incident.id,
      referenceCode: incident.referenceCode,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SAFETY_INVALID_TRIP") {
      res
        .status(422)
        .json({ code: "SAFETY_INVALID_TRIP", message: "Invalid trip." });
      return;
    }
    next(error);
  }
});

safetyRouter.post("/incidents/:incidentId/evidence", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const incidentId = String(req.params["incidentId"] ?? "");
    const mimeType = String(req.body?.mimeType ?? "");
    const sizeBytes = Number(req.body?.sizeBytes ?? 0);
    const fileName = String(req.body?.fileName ?? "evidence.bin");
    const upload = await createEvidenceUploadRequest({
      userId,
      incidentId,
      mimeType,
      sizeBytes,
      fileName,
    });
    res.status(200).json(upload);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SAFETY_EVIDENCE_INVALID_TYPE"
    ) {
      res.status(422).json({
        code: "SAFETY_EVIDENCE_INVALID_TYPE",
        message: "Invalid evidence type.",
      });
      return;
    }
    if (
      error instanceof Error &&
      error.message === "SAFETY_EVIDENCE_TOO_LARGE"
    ) {
      res.status(413).json({
        code: "SAFETY_EVIDENCE_TOO_LARGE",
        message: "Evidence too large.",
      });
      return;
    }
    next(error);
  }
});

safetyRouter.get("/history", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const limit = Number(req.query["limit"] ?? 20);
    const history = await listSafetyHistory(userId, limit);
    res.status(200).json(history);
  } catch (error) {
    next(error);
  }
});

// Check-ins
safetyRouter.post("/check-ins/:checkInId/respond", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const checkInId = String(req.params["checkInId"] ?? "");
    const response = req.body?.response === "cancel" ? "cancel" : "ok";
    const result = await respondToSafetyCheckIn({
      userId,
      checkInId,
      response,
    });
    res.status(200).json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SAFETY_CHECK_IN_NOT_FOUND"
    ) {
      res.status(404).json({
        code: "SAFETY_CHECK_IN_NOT_FOUND",
        message: "Check-in not found.",
      });
      return;
    }
    if (
      error instanceof Error &&
      error.message === "SAFETY_CHECK_IN_ALREADY_RESOLVED"
    ) {
      res.status(409).json({
        code: "SAFETY_CHECK_IN_ALREADY_RESOLVED",
        message: "Check-in already resolved.",
      });
      return;
    }
    next(error);
  }
});
