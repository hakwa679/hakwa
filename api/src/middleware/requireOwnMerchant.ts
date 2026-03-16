import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { merchant } from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";
import { ForbiddenError, NotFoundError } from "../services/merchantService.ts";

/**
 * requireOwnMerchant — confirms that the authenticated user owns the merchant
 * record identified by `req.merchantId` (set by preceding middleware/route).
 *
 * This middleware attaches `req.merchant` for downstream handlers so they
 * don't have to query the merchant again.
 *
 * Usage: place after requireRole("merchant") on all /api/merchants/me routes.
 */
export async function requireOwnMerchant(
  req: Request & { merchantRecord?: typeof merchant.$inferSelect },
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

  const rows = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, session.user.id))
    .limit(1);

  if (rows.length === 0) {
    next(new NotFoundError("Merchant record not found for this user."));
    return;
  }

  const m = rows[0]!;

  if (m.userId !== session.user.id) {
    next(
      new ForbiddenError("FORBIDDEN", "You do not own this merchant record."),
    );
    return;
  }

  // Attach the merchant record so route handlers can use it directly.
  req.merchantRecord = m;
  next();
}
