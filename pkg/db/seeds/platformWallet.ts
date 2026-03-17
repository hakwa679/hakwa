import db from "../index.ts";
import { and, eq } from "drizzle-orm";
import { wallet, HolderType } from "../schema/wallet.ts";

/**
 * Ensures the platform wallet row exists for holderId='hakwa'.
 */
export async function ensurePlatformWalletSeed(): Promise<void> {
  const existing = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(
      and(
        eq(wallet.holderType, HolderType.HAKWA),
        eq(wallet.holderId, "hakwa"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(wallet).values({
    holderType: HolderType.HAKWA,
    holderId: "hakwa",
    balance: "0.00",
  });
}
