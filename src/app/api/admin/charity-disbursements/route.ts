import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";

// Real, admin-entered records of charity money ZRP actually sent out.
// Nothing here is computed or estimated - every record reflects a real
// disbursement an admin is vouching for. Full ADMIN role required
// (not just staff/moderator), since this is financial/public-facing data.

const CAUSES = ["orphanages", "schools", "hospitals", "climate"];

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const disbursements = await prisma.charityDisbursement.findMany({
    orderBy: { disbursedAt: "desc" },
  });

  return NextResponse.json({ disbursements });
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await req.json();
    const { beneficiaryName, cause, amount, currency, disbursedAt, note, proofUrl } = body;

    if (!beneficiaryName || typeof beneficiaryName !== "string" || !beneficiaryName.trim()) {
      return NextResponse.json({ error: "Beneficiary name is required" }, { status: 400 });
    }
    if (!CAUSES.includes(cause)) {
      return NextResponse.json(
        { error: `Cause must be one of: ${CAUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
    const disbursedAtDate = new Date(disbursedAt);
    if (isNaN(disbursedAtDate.getTime()) || disbursedAtDate > new Date()) {
      return NextResponse.json(
        { error: "Disbursement date must be a valid date not in the future" },
        { status: 400 }
      );
    }

    const disbursement = await prisma.charityDisbursement.create({
      data: {
        beneficiaryName: beneficiaryName.trim(),
        cause,
        amount: amountNum,
        currency: typeof currency === "string" && currency.trim() ? currency.trim() : "USD",
        disbursedAt: disbursedAtDate,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        proofUrl: typeof proofUrl === "string" && proofUrl.trim() ? proofUrl.trim() : null,
        recordedById: adminCheck.session.user.id,
        recordedByUsername: adminCheck.session.user.username ?? null,
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "charity_disbursement.create",
      targetType: "CharityDisbursement",
      targetId: disbursement.id,
      metadata: { beneficiaryName: disbursement.beneficiaryName, cause, amount: amountNum },
    });

    return NextResponse.json(disbursement, { status: 201 });
  } catch (error) {
    console.error("Error recording charity disbursement:", error);
    return NextResponse.json(
      { error: "Failed to record disbursement" },
      { status: 500 }
    );
  }
}
