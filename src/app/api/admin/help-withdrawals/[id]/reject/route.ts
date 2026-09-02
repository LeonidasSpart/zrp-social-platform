import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";

// Rejects a pending HELP withdrawal and releases the reserved funds
// back to the campaign's available balance.
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
    data: { status: "REJECTED" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Withdrawal is already being processed." }, { status: 409 });
  }

  await prisma.helpCampaign.update({
    where: { id: withdrawal.campaignId },
    data: { balance: { increment: withdrawal.amount } },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: "help_withdrawal.reject",
    targetType: "HelpWithdrawalRequest",
    targetId: id,
    metadata: { amount: withdrawal.amount.toString() },
  });

  return NextResponse.json({ success: true });
}
