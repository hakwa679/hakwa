import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import db from "@hakwa/db";
import { bankAccount, payout, payoutBatch } from "@hakwa/db/schema";
import { nextPayoutDate } from "@hakwa/core";
import { requireRole } from "../middleware/requireRole.ts";
import { requireOwnMerchant } from "../middleware/requireOwnMerchant.ts";

export const merchantPayoutsRouter = Router();
merchantPayoutsRouter.use(requireRole("merchant"));
merchantPayoutsRouter.use(requireOwnMerchant);

function formatWeekPeriod(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const fmt = new Intl.DateTimeFormat("en-FJ", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

merchantPayoutsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const merchantRecord = (
      req as Request & {
        merchantRecord?: { id: string };
      }
    ).merchantRecord;

    if (!merchantRecord) {
      res
        .status(401)
        .json({ code: "UNAUTHORIZED", message: "Authentication required." });
      return;
    }

    const query = req.query as Record<string, string | undefined>;
    const cursor = query["cursor"];
    const limit = Math.min(Number(query["limit"] ?? 20), 50);

    try {
      const rows = await db
        .select({
          id: payout.id,
          amount: payout.amount,
          serviceFee: payout.serviceFee,
          netAmount: payout.netAmount,
          status: payout.status,
          processedAt: payout.processedAt,
          completedAt: payout.completedAt,
          failureReason: payout.failureReason,
          weekStart: payoutBatch.weekStart,
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          createdAt: payout.createdAt,
        })
        .from(payout)
        .innerJoin(payoutBatch, eq(payout.batchId, payoutBatch.id))
        .innerJoin(bankAccount, eq(payout.bankAccountId, bankAccount.id))
        .where(
          and(
            eq(payout.merchantId, merchantRecord.id),
            ...(cursor ? [lt(payout.createdAt, new Date(cursor))] : []),
          ),
        )
        .orderBy(desc(payout.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);

      res.json({
        items: items.map((row) => {
          const weekStartDate = row.weekStart;
          const weekEnd = new Date(`${weekStartDate}T00:00:00.000Z`);
          weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

          return {
            id: row.id,
            weekStart: weekStartDate,
            weekEnd: weekEnd.toISOString().slice(0, 10),
            weekPeriod: formatWeekPeriod(weekStartDate),
            amount: row.amount,
            serviceFee: row.serviceFee,
            netAmount: row.netAmount,
            status: row.status,
            processedAt: row.processedAt?.toISOString() ?? null,
            completedAt: row.completedAt?.toISOString() ?? null,
            bankAccount: {
              bankName: row.bankName,
              accountNumberLast4: row.accountNumber.slice(-4),
            },
          };
        }),
        nextCursor: hasMore
          ? (items[items.length - 1]?.createdAt.toISOString() ?? null)
          : null,
        nextPayoutDate: nextPayoutDate(new Date()).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

merchantPayoutsRouter.get(
  "/:payoutId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const merchantRecord = (
      req as Request & {
        merchantRecord?: { id: string };
      }
    ).merchantRecord;

    if (!merchantRecord) {
      res
        .status(401)
        .json({ code: "UNAUTHORIZED", message: "Authentication required." });
      return;
    }

    const { payoutId } = req.params as { payoutId: string };

    try {
      const [row] = await db
        .select({
          id: payout.id,
          merchantId: payout.merchantId,
          amount: payout.amount,
          serviceFee: payout.serviceFee,
          netAmount: payout.netAmount,
          status: payout.status,
          failureReason: payout.failureReason,
          processedAt: payout.processedAt,
          completedAt: payout.completedAt,
          weekStart: payoutBatch.weekStart,
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
        })
        .from(payout)
        .innerJoin(payoutBatch, eq(payout.batchId, payoutBatch.id))
        .innerJoin(bankAccount, eq(payout.bankAccountId, bankAccount.id))
        .where(eq(payout.id, payoutId))
        .limit(1);

      if (!row) {
        res
          .status(404)
          .json({ code: "NOT_FOUND", message: "Payout not found." });
        return;
      }

      if (row.merchantId !== merchantRecord.id) {
        res.status(403).json({ code: "FORBIDDEN", message: "Forbidden." });
        return;
      }

      const weekEnd = new Date(`${row.weekStart}T00:00:00.000Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

      res.json({
        id: row.id,
        weekStart: row.weekStart,
        weekEnd: weekEnd.toISOString().slice(0, 10),
        amount: row.amount,
        serviceFee: row.serviceFee,
        netAmount: row.netAmount,
        status: row.status,
        failureReason: row.failureReason,
        processedAt: row.processedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        bankAccount: {
          bankName: row.bankName,
          accountNumberLast4: row.accountNumber.slice(-4),
        },
        note:
          row.status === "failed"
            ? "Funds remain in your wallet balance and will be included in the next payout."
            : null,
      });
    } catch (err) {
      next(err);
    }
  },
);
