import type { NextFunction, Request, Response } from "express";
import { getSessionFromRequest } from "@hakwa/auth";

export interface MapModeratorSession {
  userId: string;
  role: string;
}

export async function requireMapModerator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return;
  }

  const role = String((session.user as Record<string, unknown>)["role"] ?? "");
  if (role !== "admin" && role !== "map_moderator") {
    res.status(403).json({
      code: "FORBIDDEN",
      message: "Map moderator role required.",
    });
    return;
  }

  res.locals["mapModerator"] = {
    userId: session.user.id,
    role,
  } satisfies MapModeratorSession;

  next();
}
