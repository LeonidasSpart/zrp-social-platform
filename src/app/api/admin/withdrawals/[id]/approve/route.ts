import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendUsdc } from "@/lib/solana";
import { logAdminAction } from "@/lib/audit-log";
import {
  recordTransactionHash,
  finalizeWithdrawal,
  failAndRefundWithdrawal,
  extractBroadcastSignature,
  reconcileWithdrawal,
} from "@/lib/withdrawals";

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
    // ⚠️ CORRECTNESS: sendUsdc() throwing does NOT mean no funds moved.
    // @solana/spl-token's transfer() calls @solana/web3.js's own
    // sendAndConfirmTransaction() under the hood (verified directly in
    // both packages' installed source), which sends the transaction
    // FIRST and only separately awaits confirmation - a timeout, an
    // expired blockhash, or an RPC hiccup while polling for
    // confirmation throws even though the transaction may already have
    // landed (or may still land later). The SDK itself knows this: it
    // attaches the broadcast signature to every one of these ambiguous
    // errors (`error.signature`), and TransactionExpiredTimeoutError's
    // own message says outright "It is unknown if it succeeded or
    // failed." Refunding unconditionally here - the previous behavior -
    // could pay a creator's balance back AND leave the on-chain transfer
    // standing, a real platform-funds loss.
    //
    // extractBroadcastSignature() is the single source of truth for
    // "was anything ever broadcast": if it finds a signature, this is
    // resolved through the EXACT SAME idempotent reconciliation decision
    // tree the periodic job uses (never a bespoke guess here), so a live
    // request and a later reconciliation pass can never disagree. Only
    // when there is truly no signature at all - the transfer failed
    // before ever reaching the network - is it safe to refund
    // immediately.
    const signatureFromError = extractBroadcastSignature(error);

    if (signatureFromError) {
      console.error(
        `Withdrawal ${id}: sendUsdc() threw but broadcast signature ${signatureFromError} exists - outcome is ambiguous, resolving via reconciliation instead of refunding:`,
        error
      );

      await recordTransactionHash(id, signatureFromError);
      const fresh = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id } });
      const outcome = await reconcileWithdrawal(fresh);

      await logAdminAction({
        actor: adminCheck.session,
        action: "withdrawal.approve_ambiguous",
        targetType: "WithdrawalRequest",
        targetId: id,
        metadata: {
          amount: withdrawal.amount.toString(),
          transactionHash: signatureFromError,
          error: error instanceof Error ? error.message : String(error),
          reconcileOutcome: outcome,
        },
      });

      if (outcome === "finalized") {
        return NextResponse.json({ success: true, transactionHash: signatureFromError });
      }
      if (outcome === "failed_and_refunded") {
        return NextResponse.json(
          { error: "Transfer failed on-chain. The withdrawal amount has been returned to the creator's balance." },
          { status: 500 }
        );
      }
      // "still_pending" or "already_resolved": genuinely not yet known,
      // or resolved by something else since this request started -
      // never claim success or failure ourselves here. The periodic
      // reconciliation job (or this same fast-path, on a retry) will
      // finish it.
      return NextResponse.json(
        {
          error:
            "Transfer outcome is not yet confirmed on-chain. This withdrawal will be automatically resolved shortly - do not resubmit.",
          transactionHash: signatureFromError,
        },
        { status: 202 }
      );
    }

    // No signature anywhere on the error: the transfer never reached
    // the network (invalid recipient, a local signing error, a
    // preflight rejection), so nothing can have moved. Safe to refund.
    console.error("Withdrawal transfer failed before broadcast:", error);

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
  const finalized = await finalizeWithdrawal(id, signature);

  await logAdminAction({
    actor: adminCheck.session,
    action: "withdrawal.approve",
    targetType: "WithdrawalRequest",
    targetId: id,
    metadata: { amount: withdrawal.amount.toString(), walletAddress: withdrawal.walletAddress, transactionHash: signature, finalized },
  });

  if (!finalized) {
    // ⚠️ CORRECTNESS: finalizeWithdrawal() returning false means the
    // durable finalize write did NOT apply - either recordTransactionHash()
    // above failed after exhausting its retries (logged CRITICAL there),
    // or something else already changed this row's status. Either way,
    // this request must NEVER report success unless that DB write
    // genuinely happened: the old code ignored this return value
    // entirely and always reported {success: true} once sendUsdc()
    // resolved, which could tell an admin a withdrawal was safely
    // completed while the row was still stuck PROCESSING with no
    // matching transactionHash - invisible until someone checked by hand.
    const current = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id } });
    if (current.status === "COMPLETED") {
      // Something else (a concurrent reconciliation pass, or a retried
      // request) already finalized this exact signature - genuinely
      // done, safe to report success.
      return NextResponse.json({ success: true, transactionHash: signature });
    }
    console.error(
      `Withdrawal ${id}: sendUsdc() succeeded (signature ${signature}) but finalizeWithdrawal() did not apply (row status: ${current.status}) - leaving for reconciliation rather than reporting success.`
    );
    return NextResponse.json(
      {
        error:
          "Transfer succeeded on-chain but could not be finalized durably yet. This withdrawal will be automatically resolved shortly.",
        transactionHash: signature,
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ success: true, transactionHash: signature });
}
