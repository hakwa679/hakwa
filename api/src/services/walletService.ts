import { sendNotification } from "@hakwa/notifications";

/**
 * Wallet service — handles wallet credit/debit events.
 *
 * Notification integration: T014 (wallet_credited) is implemented here.
 * Actual wallet DB operations sit in a subsequent feature.
 */

/** T014 — notify a user when their wallet receives a credit. */
export async function onWalletCredited(
  userId: string,
  amount: string,
  currencyCode: string,
  referenceId: string,
): Promise<void> {
  const displayAmount = `${currencyCode} ${amount}`;

  await sendNotification(
    userId,
    "wallet_credited",
    {
      channel: "push",
      title: "Wallet credited",
      body: `${displayAmount} has been added to your Hakwa wallet.`,
      data: { screen: "Wallet", referenceId },
    },
    `wallet_credited:${referenceId}`,
  );
  await sendNotification(
    userId,
    "wallet_credited",
    {
      channel: "in_app",
      title: "Wallet credited",
      body: `Your wallet was topped up with ${displayAmount}.`,
      data: { screen: "Wallet", referenceId },
    },
    `wallet_credited:${referenceId}:in_app`,
  );
}
