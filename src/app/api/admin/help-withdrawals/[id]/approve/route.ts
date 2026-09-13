import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendUsdc } from "@/lib/solana";
import { logAdminAction } from "@/lib/audit-log";
import { extractBroadcastSignature } from "@/lib/withdrawals";

// Finalizes a HELP campaign withdrawal - same claim-then-transfer
// shape as /api/admin/withdrawals/[id]/approve. Funds were already
// reserved (deducted from the campaign's balance) when the request
// was created, so no further balance change on success - only on
// failure, where the reservation is released back.
//
// ⚠️ CORRECTNESS: this route does NOT have the periodic reconciliation
// job src/lib/withdrawals.ts wires up for creator withdrawals - HELP
// campaign volume is low enough that automatic reconciliation was
// judged out of scope for this pass, a deliberate limitation, not an
// oversight. What it DOES share with that module is the two safety
// properties that matter most: (1) sendUsdc() throwing does NOT mean no
// funds moved - see extractBroadcastSignature()'s own comment - so an
// ambiguous outcome (a broadcast signature exists but its result is
// unknown to us) is never refunded automatically, only recorded and
// left PROCESSING for a human to resolve by checking the signature on
// an explorer; and (2) success is never reported unless the finalize
// $transaction actually committed - a failure there, even after
// sendUsdc() itself succeeded, is surfaced as "needs manual review",
// never silently swallowed into the same catch block that refunds a
// failed SEND (which would double-lose funds that had already left the
// platform wallet).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await props.params;

  const withdrawal = await prisma.helpWithdrawalRequest.findUnique({ where: { id } });
  if (!withdrawal) {
    return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
  }
  if (withdrawal.status !== "PENDING") {
    return NextResponse.json(
      { error: `Withdrawal is already ${withdrawal.status.toLowerCase()}.` },
      { status: 400 }
    );
  }

  const claimed = await prisma.helpWithdrawalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Withdrawal is already being processed." }, { status: 409 });
  }

  let signature: string;
  try {
    signature = await sendUsdc(withdrawal.walletAddress, withdrawal.amount.toNumber());
  } catch (error) {
    const signatureFromError = extractBroadcastSignature(error);

    if (signatureFromError) {
      // A transaction WAS broadcast - the outcome is ambiguous, not a
      // known failure. Refunding here could double-pay if it actually
      // lands. With no reconciliation job for HELP withdrawals, the
      // safest available action is to record the signature and stop:
      // leave the row PROCESSING (not FAILED, not refunded) so an admin
      // can check the signature on an explorer and resolve it by hand.
      await prisma.helpWithdrawalRequest
        .update({ where: { id }, data: { transactionHash: signatureFromError } })
        .catch((hashError) =>
          console.error(
            `CRITICAL: HELP withdrawal ${id} broadcast signature ${signatureFromError} but failed to persist it:`,
            hashError
          )
        );

      console.error(
        `CRITICAL: HELP withdrawal ${id} sendUsdc() threw but broadcast signature ${signatureFromError} exists - outcome is ambiguous, leaving PROCESSING for manual review instead of refunding:`,
        error
      );

      await logAdminAction({
        actor: adminCheck.session,
        action: "help_withdrawal.approve_ambiguous",
        targetType: "HelpWithdrawalRequest",
        targetId: id,
        metadata: {
          amount: withdrawal.amount.toString(),
          transactionHash: signatureFromError,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return NextResponse.json(
        {
          error:
            "Transfer outcome is uncertain and requires manual review before this withdrawal can be resolved. It has NOT been refunded automatically.",
          transactionHash: signatureFromError,
        },
        { status: 202 }
      );
    }

    // No signature anywhere on the error: nothing was ever broadcast,
    // so refunding immediately cannot double-pay.
    console.error("HELP withdrawal transfer failed before broadcast:", error);

    await prisma.$transaction([
      prisma.helpWithdrawalRequest.update({ where: { id }, data: { status: "FAILED" } }),
      prisma.helpCampaign.update({
        where: { id: withdrawal.campaignId },
        data: { balance: { increment: withdrawal.amount } },
      }),
    ]);

    await logAdminAction({
      actor: adminCheck.session,
      action: "help_withdrawal.approve_failed",
      targetType: "HelpWithdrawalRequest",
      targetId: id,
      metadata: { amount: withdrawal.amount.toString(), error: error instanceof Error ? error.message : String(error) },
    });

    return NextResponse.json(
      { error: "Transfer failed. The withdrawal amount has been returned to the campaign's balance." },
      { status: 500 }
    );
  }

  // Funds have moved on-chain. Record the signature as its own durable
  // write FIRST, before the finalize transaction - so if the finalize
  // step below fails, we are never left with zero record of a transfer
  // that actually happened.
  await prisma.helpWithdrawalRequest
    .update({ where: { id }, data: { transactionHash: signature } })
    .catch((hashError) =>
      console.error(`CRITICAL: HELP withdrawal ${id} sent on-chain (signature ${signature}) but failed to persist the transaction hash:`, hashError)
    );

  try {
    await prisma.$transaction([
      prisma.helpWithdrawalRequest.updateMany({
        where: { id, status: "PROCESSING" },
        data: { status: "COMPLETED", transactionHash: signature, processedAt: new Date() },
      }),
      prisma.helpCampaign.update({
        where: { id: withdrawal.campaignId },
        data: { totalWithdrawn: { increment: withdrawal.amount } },
      }),
    ]);
  } catch (finalizeError) {
    // ⚠️ CORRECTNESS: funds have DEFINITELY moved at this point (sendUsdc
    // already resolved with a signature) - this must NEVER be treated as
    // a failed send. Reporting success would be a lie if this write
    // didn't apply; treating it as a failed transfer and refunding
    // (the old behavior - this failure used to land in the SAME catch
    // block as a failed sendUsdc()) would double-lose real funds that
    // already left the platform wallet. Surface it as unresolved instead.
    console.error(
      `CRITICAL: HELP withdrawal ${id} funds sent on-chain (signature ${signature}) but the finalize transaction failed - left PROCESSING with the signature recorded for manual review:`,
      finalizeError
    );

    await logAdminAction({
      actor: adminCheck.session,
      action: "help_withdrawal.approve_finalize_failed",
      targetType: "HelpWithdrawalRequest",
      targetId: id,
      metadata: { amount: withdrawal.amount.toString(), transactionHash: signature },
    });

    return NextResponse.json(
      {
        error: "Transfer succeeded on-chain but could not be finalized. This requires manual review.",
        transactionHash: signature,
      },
      { status: 202 }
    );
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "help_withdrawal.approve",
    targetType: "HelpWithdrawalRequest",
    targetId: id,
    metadata: { amount: withdrawal.amount.toString(), walletAddress: withdrawal.walletAddress, transactionHash: signature },
  });

  return NextResponse.json({ success: true, transactionHash: signature });
}
