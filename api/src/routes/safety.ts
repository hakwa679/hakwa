import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getSessionFromRequest } from "@hakwa/auth";

export const safetyRouter = Router();

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
  todo(req, res, next, "TODO T017: list safety contacts");
});

safetyRouter.post("/contacts", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T017: add safety contact");
});

safetyRouter.delete("/contacts/:contactId", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T017: delete safety contact");
});

safetyRouter.post("/contacts/test-alert", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T018: send test alert");
});

// SOS
safetyRouter.post("/sos", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T013/T023: trigger SOS");
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
  todo(req, res, next, "TODO T020: create trip share");
});

safetyRouter.delete("/trips/:tripId/share", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T023: revoke trip share");
});

safetyRouter.get("/share/:token", (req, res, next) => {
  todo(req, res, next, "TODO T021: public share details");
});

safetyRouter.get("/share/:token/stream", (req, res, next) => {
  todo(req, res, next, "TODO T022: public share SSE stream");
});

// Vehicle verification
safetyRouter.get("/trips/:tripId/verify", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T026: safety code + vehicle verify details");
});

safetyRouter.post("/trips/:tripId/wrong-vehicle", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T027/T046: report wrong vehicle");
});

// Incident reporting + history
safetyRouter.post("/incidents/report", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T034/T072: file incident report");
});

safetyRouter.get("/history", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T038/T079: safety history");
});

// Check-ins
safetyRouter.post("/check-ins/:checkInId/respond", async (req, res, next) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  todo(req, res, next, "TODO T031/T065: respond to safety check-in");
});
