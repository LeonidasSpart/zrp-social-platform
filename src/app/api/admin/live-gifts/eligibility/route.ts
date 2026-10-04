import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { computeGiftEligibility } from "@/lib/live-gifts/eligibility";

/**
 * Admin -> Live -> Gift Eligibility (mission spec section 6). A search
 * term (username or user id) is required for the general case to avoid
 * ever scanning/computing eligibility for the whole User table; with no
 * search, this instead lists the users most recently active in the gift
 * economy (by CoinWallet.updatedAt) - a useful default view, never the
 * entire platform.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20") || 20));

  let userIds: string[];
  if (search) {
    const where: Prisma.UserWhereInput = {
      OR: [{ username: { contains: search, mode: "insensitive" } }, { id: search }],
    };
    const users = await prisma.user.findMany({ where, select: { id: true }, take: limit });
    userIds = users.map((u) => u.id);
  } else {
    const wallets = await prisma.coinWallet.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { userId: true },
    });
    userIds = wallets.map((w) => w.userId);
  }

  const results = await Promise.all(userIds.map((id) => computeGiftEligibility(id)));

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    results: results.map((r) => ({ ...r, user: userById.get(r.userId) ?? null })),
  });
}
