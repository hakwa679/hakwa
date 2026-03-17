import { sendNotification } from "@hakwa/notifications";

/**
 * Payout processor — handles merchant payout lifecycle events.
 *
 * Notification integration: T015 (payout_processed, payout_failed).
 * Actual payout calculation and disbursement logic is in feature 006.
 */

/**
 * T015a — notify a merchant when their weekly payout has been processed
 * successfully and funds are on their way.
 */
export async function onPayoutProcessed(
  merchantUserId: string,
  payoutId: string,
  amount: string,
  currencyCode: string,
): Promise<void> {
  const displayAmount = `${currencyCode} ${amount}`;

  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "push",
      title: "Payout sent",
      body: `Your payout of ${displayAmount} has been processed.`,
      data: { screen: "PayoutHistory", payoutId },
    },
    `payout_processed:${payoutId}`,
  );
  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "in_app",
      title: "Payout processed",
      body: `${displayAmount} is on its way to your bank account.`,
      data: { screen: "PayoutHistory", payoutId },
    },
    `payout_processed:${payoutId}:in_app`,
  );
  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "email",
      title: "Your Hakwa payout has been sent",
      body: `Your payout of ${displayAmount} has been successfully processed.`,
      data: { payoutId, amount, currencyCode },
    },
    `payout_processed:${payoutId}:email`,
  );
}

/**
 * T015b — notify a merchant when their payout has failed so they can
 * take corrective action (update banking details, contact support).
 */
export async function onPayoutFailed(
  merchantUserId: string,
  payoutId: string,
  reason: string,
): Promise<void> {
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "push",
      title: "Payout failed",
      body: "Your payout could not be processed. Please check your banking details.",
      data: { screen: "PayoutHistory", payoutId, reason },
    },
    `payout_failed:${payoutId}`,
  );
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "in_app",
      title: "Payout failed",
      body: "There was an issue with your payout. Tap to find out more.",
      data: { screen: "PayoutHistory", payoutId, reason },
    },
    `payout_failed:${payoutId}:in_app`,
  );
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "email",
      title: "Action required: your Hakwa payout failed",
      body: `We were unable to process your payout. Reason: ${reason}. Please update your banking details or contact support.`,
      data: { payoutId, reason },
    },
    `payout_failed:${payoutId}:email`,
  );
}
