import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LiveGiftErrors } from "./errors";

export interface AdjustCoinBalanceInput {
  adminId: string;
  userId: string;
  /** Signed. Positive credits the user, negative debits them. */
  delta: number;
  reason: string;
}

export interface AdjustCoinBalanceResult {
  id: string;
  beforeBalance: number;
  delta: number;
  afterBalance: number;
}

/**
 * The ONLY code path allowed to move CoinWallet.balance for a reason other
 * than a real purchase (purchaseCoins) or a real gift send (sendGift).
 * Never a bolt-on admin PATCH on CoinWallet - every adjustment is a
 * dedicated, audited CoinAdjustment row, written in the SAME
 * $transaction as the balance change so the ledger row and the balance
 * it describes can never drift apart (identical atomicity reasoning to
 * sendGift()'s debit + ledger insert).
 *
 * A debit (negative delta) uses the same conditional-update pattern as
 * sendGift()'s debit - `balance + delta >= 0` - so a concurrent spend can
 * never be raced into a negative balance; the CoinWallet
 * balance-nonnegative CHECK constraint is the final backstop either way.
 *
 * The before/after pair is read from the SAME atomic `UPDATE ... RETURNING`
 * that moves the balance, not from a separate read before the transaction
 * - a prior version read `beforeBalance` via an upsert before starting the
 * transaction, which left a window where a concurrent sendGift()/purchase
 * against the same wallet would make the recorded before/after wrong even
 * though the balance itself was still updated correctly. For a financial
 * ledger, a wrong-but-internally-consistent audit row is as bad as a wrong
 * balance, so this reads the true pre-update value atomically instead.
 */
export async function adjustCoinBalance(input: AdjustCoinBalanceInput): Promise<AdjustCoinBalanceResult> {
  const { adminId, userId, delta, reason } = input;

  if (!Number.isInteger(delta) || delta === 0) {
    throw LiveGiftErrors.validation("delta must be a non-zero whole number of coins.");
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw LiveGiftErrors.validation("A reason is required for every coin adjustment.");
  }
  if (reason.length > 1000) {
    throw LiveGiftErrors.validation("Reason is too long.");
  }

  const wallet = await prisma.coinWallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<{ balance: number }[]>`
      UPDATE "CoinWallet"
      SET balance = balance + ${delta}
      WHERE id = ${wallet.id} AND balance + ${delta} >= 0
      RETURNING balance
    `;
    if (updated.length !== 1) throw LiveGiftErrors.adjustmentWouldGoNegative();

    const afterBalance = updated[0].balance;
    const beforeBalance = afterBalance - delta;

    return tx.coinAdjustment.create({
      data: {
        userId,
        adminId,
        beforeBalance,
        delta,
        afterBalance,
        reason: reason.trim(),
      },
    });
  });

  return {
    id: row.id,
    beforeBalance: row.beforeBalance,
    delta: row.delta,
    afterBalance: row.afterBalance,
  };
}

export async function listCoinAdjustments(userId: string, limit = 50) {
  return prisma.coinAdjustment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    include: {
      admin: { select: { id: true, username: true, name: true } },
    },
  });
}

// Re-exported so routes never need to import Prisma types directly just
// to type a response shape.
export type { Prisma };
