import { Router, type Request, type Response } from "express";
import { getSessionFromRequest } from "@hakwa/auth";

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

  res
    .status(501)
    .json({
      code: "NOT_IMPLEMENTED",
      message: "TODO T082: list safety incidents queue",
    });
});

adminSafetyRouter.patch("/incidents/:id", async (req, res) => {
  const allowed = await requireSafetyAdmin(req, res);
  if (!allowed) return;

  res
    .status(501)
    .json({
      code: "NOT_IMPLEMENTED",
      message: "TODO T083: update safety incident status",
    });
});
