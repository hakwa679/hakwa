import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import { requireRole } from "../middleware/requireRole.ts";
import {
  getMerchantBalance,
  getLedgerPage,
} from "../services/walletService.ts";
import { HolderType } from "@hakwa/db/schema";
import { ForbiddenError } from "../services/merchantService.ts";

export const merchantWalletRouter = Router();

// All merchant wallet routes require the "merchant" role
merchantWalletRouter.use(requireRole("merchant"));

// ---------------------------------------------------------------------------
// Auth helper — returns the authenticated merchant's user id
// ---------------------------------------------------------------------------

async function getMerchantId(
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

// ---------------------------------------------------------------------------
// T014 — GET /api/merchant/wallet/balance
// Returns the merchant's current balance + payout metadata.
// 403 if the requesting user is not the merchant matching the wallet.
// ---------------------------------------------------------------------------

merchantWalletRouter.get(
  "/balance",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await getMerchantId(req, res);
    if (!userId) return;

    // T025 — verify ownership: the authenticated user IS the merchant
    const session = await getSessionFromRequest(req);
    if (!session || session.user.id !== userId) {
      next(new ForbiddenError("FORBIDDEN", "Access denied."));
      return;
    }

    try {
      const balance = await getMerchantBalance(userId);
      res.json(balance);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// T015 — GET /api/merchant/wallet/ledger?cursor=<id>&limit=20
// Paginated ledger history with human-readable labels.
// ---------------------------------------------------------------------------

merchantWalletRouter.get(
  "/ledger",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await getMerchantId(req, res);
    if (!userId) return;

    const query = req.query as Record<string, string | undefined>;
    const cursor = query["cursor"];
    const limit = Math.min(Number(query["limit"] ?? 20), 100);

    try {
      const page = await getLedgerPage(
        userId,
        HolderType.MERCHANT,
        cursor,
        limit,
      );
      res.json(page);
    } catch (err) {
      next(err);
    }
  },
);
