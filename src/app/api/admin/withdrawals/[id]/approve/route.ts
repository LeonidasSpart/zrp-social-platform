import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendUsdc } from "@/lib/solana";
import { logAdminAction } from "@/lib/audit-log";
import { recordTransactionHash, finalizeWithdrawal, failAndRefundWithdrawal } from "@/lib/withdrawals";

// Finalizes a withdrawal: executes the on-chain USDC transfer, records
// the transaction hash, and marks the request COMPLETED. The funds
// were already reserved (deducted from the creator's balance) when the
// request was created, so no further balance change happens on
// success - only on failure, where the reservation is released back.
//
// ⚠️ CRASH SAFETY: recordTransactionHash() and finalizeWithdrawal() are
// deliberately two separate, idempotent steps rather than one
// $transaction run right after sendUsdc() returns - see
// src/lib/withdrawals.ts's own comment for the full design. In short:
// this process can be killed (a Railway redeploy's SIGTERM, a crash) at
// any point after sendUsdc() has already moved real funds on-chain.
// Persisting the signature FIRST, as its own minimal write, means a
// crash after that point still leaves a durable trail - the periodic
// reconciliation job (src/lib/withdrawals-reconcile-runner.ts) can find
// this exact row, ask Solana whether that signature actually landed,
// and finish the job with the SAME idempotent finalizeWithdrawal() this
// route calls, without ever double-crediting the creator's balance.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await props.params;

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id },
  });

  if (!withdrawal) {
    return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
  }

  if (withdrawal.status !== "PENDING") {
    return NextResponse.json(
      { error: `Withdrawal is already ${withdrawal.status.toLowerCase()}.` },
      { status: 400 }
    );
  }

  // Move it to PROCESSING first so a second concurrent approval click
  // can't also try to send funds - only one request can win this
  // conditional update.
  const claimed = await prisma.withdrawalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });

  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Withdrawal is already being processed." },
      { status: 409 }
    );
  }

  let signature: string;
  try {
    signature = await sendUsdc(withdrawal.walletAddress, withdrawal.amount.toNumber());
  } catch (error) {
    // sendUsdc() itself threw: spl-token's transfer() only resolves once
    // a submission is confirmed, so a thrown error here means no funds
    // moved (or, in the rare case they did and only OUR observation of
    // that failed, the periodic reconciliation job's wallet-history scan
    // - see withdrawals.ts - will find the real on-chain outcome later
    // and correct this safely either way). Safe to refund immediately.
    console.error("Withdrawal transfer failed:", error);

    await failAndRefundWithdrawal(
      id,
      error instanceof Error ? error.message : String(error)
    );

    await logAdminAction({
      actor: adminCheck.session,
      action: "withdrawal.approve_failed",
      targetType: "WithdrawalRequest",
      targetId: id,
      metadata: { amount: withdrawal.amount.toString(), error: error instanceof Error ? error.message : String(error) },
    });

    return NextResponse.json(
      { error: "Transfer failed. The withdrawal amount has been returned to the creator's balance." },
      { status: 500 }
    );
  }

  // Funds have moved on-chain. From here on, every step is idempotent
  // and crash-recoverable - see the module comment above.
  await recordTransactionHash(id, signature);
  await finalizeWithdrawal(id, signature);

  await logAdminAction({
    actor: adminCheck.session,
    action: "withdrawal.approve",
    targetType: "WithdrawalRequest",
    targetId: id,
    metadata: { amount: withdrawal.amount.toString(), walletAddress: withdrawal.walletAddress, transactionHash: signature },
  });

  return NextResponse.json({ success: true, transactionHash: signature });
}
