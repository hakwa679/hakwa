import type { Request, Response, NextFunction } from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import { ForbiddenError } from "../services/merchantService.ts";

/**
 * requireRole — asserts that the authenticated user holds one of the allowed
 * roles. Calls next(ForbiddenError) if the check fails.
 *
 * Usage:
 *   router.get("/me", requireRole("merchant"), handler)
 *   router.get("/admin", requireRole("admin", "super_admin"), handler)
 */
export function requireRole(
  ...allowedRoles: string[]
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const session = await getSessionFromRequest(req);

    if (!session) {
      res
        .status(401)
        .json({ code: "UNAUTHORIZED", message: "Authentication required." });
      return;
    }

    const role = (session.user as Record<string, unknown>)["role"] as
      | string
      | undefined;

    if (!role || !allowedRoles.includes(role)) {
      next(
        new ForbiddenError(
          "FORBIDDEN",
          `This action requires one of the following roles: ${allowedRoles.join(", ")}.`,
        ),
      );
      return;
    }

    next();
  };
}
