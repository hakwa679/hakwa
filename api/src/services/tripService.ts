import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import {
  trip,
  ledgerEntry,
  wallet,
  operator,
  pointsAccount,
  pointsLedger,
  HolderType,
} from "@hakwa/db/schema";
import { calculateFare, splitFare } from "@hakwa/core";
import { sendNotification } from "@hakwa/notifications";
import { notifyBalanceUpdated } from "./walletService.ts";

/** Points awarded to driver on trip completion. */
const TRIP_COMPLETION_POINTS = 50 as const;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class TripServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TripServiceError";
  }
}

// ---------------------------------------------------------------------------
// Internal: find or create a wallet by holder
// ---------------------------------------------------------------------------

async function findOrCreateWallet(
  holderType: HolderType,
  holderId: string,
): Promise<typeof wallet.$inferSelect> {
  const existing = await db
    .select()
    .from(wallet)
    .where(
      and(eq(wallet.holderType, holderType), eq(wallet.holderId, holderId)),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(wallet)
    .values({ holderType, holderId, balance: "0.00" })
    .returning();

  return created!;
}

// ---------------------------------------------------------------------------
// completeTrip — atomic transaction: update trip + ledger entries + points
// ---------------------------------------------------------------------------

export interface CompleteTripResult {
  tripId: string;
  status: "completed";
  actualFare: string;
  driverEarnings: string;
  platformFee: string;
  completedAt: string;
}

export async function completeTrip(
  tripId: string,
  driverId: string,
  actualDistanceKm: number,
): Promise<CompleteTripResult> {
  // 1. Verify trip is in_progress and owned by this driver
  const [tripRow] = await db
    .select()
    .from(trip)
    .where(
      and(
        eq(trip.id, tripId),
        eq(trip.driverId, driverId),
        eq(trip.status, "in_progress"),
      ),
    )
    .limit(1);

  if (!tripRow) {
    throw new TripServiceError(
      409,
      "INVALID_TRIP_STATE",
      "Trip is not in_progress or is not assigned to you.",
    );
  }

  // 2. Compute fare split (T009/T010: use shared calculateFare/splitFare)
  const actualFare = calculateFare(actualDistanceKm);
  const { platform: platformFee, merchant: driverEarnings } =
    splitFare(actualFare);

  // 3. Find or create merchant wallet (outside transaction to avoid nesting issues)
  // Platform entries use holderId='hakwa' directly — no wallet lookup needed.
  // Find driver's merchant via operator table; fall back to individual wallet.
  const [operatorRow] = await db
    .select({ merchantId: operator.merchantId })
    .from(operator)
    .where(eq(operator.userId, driverId))
    .limit(1);

  const merchantWallet = operatorRow
    ? await findOrCreateWallet(HolderType.MERCHANT, operatorRow.merchantId)
    : await findOrCreateWallet(HolderType.INDIVIDUAL, driverId);

  const completedAt = new Date();

  // 4. Atomic transaction: update trip + insert ledger entries + points
  await db.transaction(async (tx) => {
    await tx
      .update(trip)
      .set({
        status: "completed",
        actualDistanceKm: actualDistanceKm.toString(),
        fare: actualFare.toString(),
        platformCommission: platformFee.toString(),
        merchantAmount: driverEarnings.toString(),
        completedAt,
      })
      .where(
        and(
          eq(trip.id, tripId),
          eq(trip.status, "in_progress"),
          eq(trip.driverId, driverId),
        ),
      );

    // T009: Atomic ledger inserts using new entryType schema
    await tx.insert(ledgerEntry).values({
      holderId: "hakwa",
      holderType: HolderType.HAKWA,
      entryType: "commission",
      amount: platformFee.toString(),
      tripId,
      description: `Platform commission — trip ${tripId}`,
    });

    // T010: merchant amount = fare - platform (no independent rounding)
    await tx.insert(ledgerEntry).values({
      holderId: merchantWallet.holderId,
      holderType: merchantWallet.holderType as HolderType,
      entryType: "trip_credit",
      amount: driverEarnings.toString(),
      tripId,
      description: `Trip earnings — trip ${tripId}`,
    });

    // Insert gamification points for driver (if points account exists)
    const [pointsAccRow] = await tx
      .select({ id: pointsAccount.id, totalPoints: pointsAccount.totalPoints })
      .from(pointsAccount)
      .where(eq(pointsAccount.userId, driverId))
      .limit(1);

    if (pointsAccRow) {
      await tx.insert(pointsLedger).values({
        accountId: pointsAccRow.id,
        amount: TRIP_COMPLETION_POINTS,
        sourceAction: "trip_completed",
        referenceId: tripId,
      });
      await tx
        .update(pointsAccount)
        .set({
          totalPoints: pointsAccRow.totalPoints + TRIP_COMPLETION_POINTS,
          updatedAt: new Date(),
        })
        .where(eq(pointsAccount.id, pointsAccRow.id));
    }
  });

  // T011: Notify merchant wallet balance updated via Redis pub/sub
  if (operatorRow) {
    // Fire-and-forget: balance push failure must not fail the trip completion
    notifyBalanceUpdated(operatorRow.merchantId, {
      balance: driverEarnings.toFixed(2), // approximate; client should re-fetch
      delta: driverEarnings.toFixed(2),
      entryType: "trip_credit",
      tripId,
    }).catch((err: unknown) => {
      console.error("[tripService] notifyBalanceUpdated failed", { err });
    });
  }

  return {
    tripId,
    status: "completed",
    actualFare: actualFare.toFixed(2),
    driverEarnings: driverEarnings.toFixed(2),
    platformFee: platformFee.toFixed(2),
    completedAt: completedAt.toISOString(),
  };
}

export async function onTripStarted(
  passengerId: string,
  driverId: string,
  tripId: string,
): Promise<void> {
  // Notify passenger
  await sendNotification(
    passengerId,
    "trip_started",
    {
      channel: "push",
      title: "Trip started",
      body: "Your trip has started. Enjoy the ride!",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:passenger`,
  );
  await sendNotification(
    passengerId,
    "trip_started",
    {
      channel: "in_app",
      title: "Trip started",
      body: "Your trip is under way.",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:passenger:in_app`,
  );

  // Notify driver
  await sendNotification(
    driverId,
    "trip_started",
    {
      channel: "in_app",
      title: "Trip started",
      body: "Your trip is live. Drive safely.",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:driver:in_app`,
  );
}

export async function onTripCompleted(
  passengerId: string,
  driverId: string,
  tripId: string,
  fareDisplay: string,
): Promise<void> {
  // Notify passenger
  await sendNotification(
    passengerId,
    "trip_completed",
    {
      channel: "push",
      title: "Trip completed",
      body: `Your trip is complete. Fare: ${fareDisplay}.`,
      data: { screen: "TripReceipt", tripId },
    },
    `trip_completed:${tripId}:passenger`,
  );
  await sendNotification(
    passengerId,
    "trip_completed",
    {
      channel: "in_app",
      title: "Trip completed",
      body: `Fare: ${fareDisplay}. Rate your trip?`,
      data: { screen: "TripReceipt", tripId },
    },
    `trip_completed:${tripId}:passenger:in_app`,
  );

  // Notify driver
  await sendNotification(
    driverId,
    "trip_completed",
    {
      channel: "push",
      title: "Trip completed",
      body: "Trip finished. Great work!",
      data: { screen: "TripSummary", tripId },
    },
    `trip_completed:${tripId}:driver`,
  );
  await sendNotification(
    driverId,
    "trip_completed",
    {
      channel: "in_app",
      title: "Trip completed",
      body: "Your earnings have been updated.",
      data: { screen: "TripSummary", tripId },
    },
    `trip_completed:${tripId}:driver:in_app`,
  );
}

/** T013 — notify passenger when a digital receipt is ready. */
export async function onReceiptGenerated(
  passengerId: string,
  tripId: string,
  receiptUrl: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "push",
      title: "Your receipt is ready",
      body: "Tap to view your trip receipt.",
      data: { screen: "TripReceipt", tripId, receiptUrl },
    },
    `receipt_generated:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "in_app",
      title: "Receipt available",
      body: "Your trip receipt is ready to view.",
      data: { screen: "TripReceipt", tripId, receiptUrl },
    },
    `receipt_generated:${tripId}:in_app`,
  );
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "email",
      title: "Your Hakwa trip receipt",
      body: "Please find your trip receipt attached or accessible at the link below.",
      data: { tripId, receiptUrl },
    },
    `receipt_generated:${tripId}:email`,
  );
}
