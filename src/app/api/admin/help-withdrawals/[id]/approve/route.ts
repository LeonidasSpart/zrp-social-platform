import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendUsdc } from "@/lib/solana";
import { logAdminAction } from "@/lib/audit-log";

// Finalizes a HELP campaign withdrawal - same claim-then-transfer
// shape as /api/admin/withdrawals/[id]/approve. Funds were already
// reserved (deducted from the campaign's balance) when the request
// was created, so no further balance change on success - only on
// failure, where the reservation is released back.
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

  try {
    const signature = await sendUsdc(withdrawal.walletAddress, withdrawal.amount.toNumber());

    await prisma.$transaction([
      prisma.helpWithdrawalRequest.update({
        where: { id },
        data: { status: "COMPLETED", transactionHash: signature, processedAt: new Date() },
      }),
      prisma.helpCampaign.update({
        where: { id: withdrawal.campaignId },
        data: { totalWithdrawn: { increment: withdrawal.amount } },
      }),
    ]);

    await logAdminAction({
      actor: adminCheck.session,
      action: "help_withdrawal.approve",
      targetType: "HelpWithdrawalRequest",
      targetId: id,
      metadata: { amount: withdrawal.amount.toString(), walletAddress: withdrawal.walletAddress, transactionHash: signature },
    });

    return NextResponse.json({ success: true, transactionHash: signature });
  } catch (error) {
    console.error("HELP withdrawal transfer failed:", error);

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
}
