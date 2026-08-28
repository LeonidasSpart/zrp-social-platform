import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Lists recorded admin-action audit entries, newest first. Filter by
// ?action=, ?targetType=, ?targetId= to narrow down to a specific
// action type or a specific target (e.g. one user or withdrawal).
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") || undefined;
  const targetType = searchParams.get("targetType") || undefined;
  const targetId = searchParams.get("targetId") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
  const cursor = searchParams.get("cursor") || undefined;

  const entries = await prisma.auditLog.findMany({
    where: { action, targetType, targetId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  let nextCursor: string | null = null;
  if (entries.length > limit) {
    const next = entries.pop();
    nextCursor = next?.id || null;
  }

  return NextResponse.json({ entries, nextCursor });
}
