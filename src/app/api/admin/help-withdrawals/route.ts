import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// List HELP campaign withdrawal requests for admin review/processing,
// same shape as /api/admin/withdrawals. Defaults to pending ones.
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const status = req.nextUrl.searchParams.get("status") || "PENDING";

  const withdrawals = await prisma.helpWithdrawalRequest.findMany({
    where: { status: status as any },
    orderBy: { createdAt: "asc" },
    include: {
      organizer: { select: { id: true, username: true, name: true, email: true } },
      campaign: { select: { id: true, title: true } },
    },
  });

  return jsonWithDecimals(withdrawals);
}
