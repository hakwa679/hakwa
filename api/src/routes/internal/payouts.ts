import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { payout, payoutBatch } from "@hakwa/db/schema";
import { createOrGetBatch } from "../../jobs/weeklyPayout.ts";
import { mondayWeekStartFor } from "@hakwa/core";
import { processBatch, retryFailedPayout } from "@hakwa/workers";

export const internalPayoutsRouter = Router();

function requireInternalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expectedKey = process.env["INTERNAL_API_KEY"];
  if (!expectedKey) {
    next();
    return;
  }

  const provided = req.header("x-internal-key");
  if (provided !== expectedKey) {
    res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Internal authentication failed.",
    });
    return;
  }

  next();
}

internalPayoutsRouter.use(requireInternalAuth);

internalPayoutsRouter.post(
  "/batches",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const weekStart =
      typeof req.body?.weekStart === "string" ? req.body.weekStart : "";

    if (!weekStart) {
      res.status(422).json({
        code: "VALIDATION_ERROR",
        message: "weekStart is required (YYYY-MM-DD).",
      });
      return;
    }

    try {
      const result = await createOrGetBatch(weekStart);
      res.status(result.created ? 201 : 200).json({
        batchId: result.id,
        status: result.status,
        weekStart: result.weekStart,
      });
    } catch (err) {
      next(err);
    }
  },
);

internalPayoutsRouter.post(
  "/batches/:batchId/process",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { batchId } = req.params as { batchId: string };

    try {
      const [batch] = await db
        .select({ id: payoutBatch.id, status: payoutBatch.status })
        .from(payoutBatch)
        .where(eq(payoutBatch.id, batchId))
        .limit(1);

      if (!batch) {
        res
          .status(404)
          .json({ code: "NOT_FOUND", message: "Payout batch not found." });
        return;
      }

      if (!["scheduled", "processing"].includes(batch.status)) {
        res.status(409).json({
          code: "INVALID_STATE",
          message: "Batch is not processable in its current state.",
        });
        return;
      }

      await processBatch(batchId);

      const [updated] = await db
        .select({
          id: payoutBatch.id,
          status: payoutBatch.status,
          merchantCount: payoutBatch.merchantCount,
          totalAmount: payoutBatch.totalAmount,
        })
        .from(payoutBatch)
        .where(eq(payoutBatch.id, batchId))
        .limit(1);

      res.status(202).json({
        batchId: updated?.id ?? batchId,
        status: updated?.status ?? "completed",
        merchantCount: updated?.merchantCount ?? 0,
        totalAmount: updated?.totalAmount ?? "0.00",
      });
    } catch (err) {
      next(err);
    }
  },
);

internalPayoutsRouter.post(
  "/:payoutId/retry",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { payoutId } = req.params as { payoutId: string };

    try {
      const [payoutRow] = await db
        .select({
          id: payout.id,
          status: payout.status,
          batchId: payout.batchId,
        })
        .from(payout)
        .where(eq(payout.id, payoutId))
        .limit(1);

      if (!payoutRow) {
        res
          .status(404)
          .json({ code: "NOT_FOUND", message: "Payout not found." });
        return;
      }

      if (payoutRow.status !== "failed") {
        res.status(409).json({
          code: "INVALID_STATE",
          message: "Only failed payouts can be retried.",
        });
        return;
      }

      const [batch] = await db
        .select({ weekStart: payoutBatch.weekStart })
        .from(payoutBatch)
        .where(eq(payoutBatch.id, payoutRow.batchId))
        .limit(1);

      if (!batch) {
        res.status(404).json({
          code: "NOT_FOUND",
          message: "Payout batch not found.",
        });
        return;
      }

      const currentWeekStart = mondayWeekStartFor(new Date());
      if (batch.weekStart > currentWeekStart) {
        res.status(409).json({
          code: "INVALID_STATE",
          message: "Payout retry is only allowed for current or prior weeks.",
        });
        return;
      }

      const retryResult = await retryFailedPayout(payoutId);
      res.json(retryResult);
    } catch (err) {
      next(err);
    }
  },
);
