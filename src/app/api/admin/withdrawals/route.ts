import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// List withdrawal requests for admin review/processing. Defaults to
// pending ones (the actionable queue); pass ?status=COMPLETED etc. to
// see others.
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const status = req.nextUrl.searchParams.get("status") || "PENDING";

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { status: status as any },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: { id: true, username: true, name: true, email: true },
      },
    },
  });

  return jsonWithDecimals(withdrawals);
}
