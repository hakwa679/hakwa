import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requireRole } from "../middleware/requireRole.ts";
import { requireOwnMerchant } from "../middleware/requireOwnMerchant.ts";
import {
  getMerchantBalance,
  getLedgerPage,
} from "../services/walletService.ts";
import { HolderType } from "@hakwa/db/schema";

export const merchantWalletRouter = Router();

// All merchant wallet routes require the "merchant" role
merchantWalletRouter.use(requireRole("merchant"));
merchantWalletRouter.use(requireOwnMerchant);

// ---------------------------------------------------------------------------
// Auth helper — returns the authenticated merchant's user id
// ---------------------------------------------------------------------------

async function getMerchantId(
  req: Request,
  res: Response,
): Promise<string | null> {
  const merchantRecord = (req as Request & { merchantRecord?: { id: string } })
    .merchantRecord;

  if (!merchantRecord) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return null;
  }

  return merchantRecord.id;
}

// ---------------------------------------------------------------------------
// T014 — GET /api/merchant/wallet/balance
// Returns the merchant's current balance + payout metadata.
// 403 if the requesting user is not the merchant matching the wallet.
// ---------------------------------------------------------------------------

merchantWalletRouter.get(
  "/balance",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const merchantId = await getMerchantId(req, res);
    if (!merchantId) return;

    try {
      const balance = await getMerchantBalance(merchantId);
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
    const merchantId = await getMerchantId(req, res);
    if (!merchantId) return;

    const query = req.query as Record<string, string | undefined>;
    const cursor = query["cursor"];
    const limit = Math.min(Number(query["limit"] ?? 20), 100);

    try {
      const page = await getLedgerPage(
        merchantId,
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
