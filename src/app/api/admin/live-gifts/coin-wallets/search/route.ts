import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Admin -> Live -> Coin Wallets "Quick Grant" search (searches every user,
 * not just ones who already have a CoinWallet row). The main GET
 * /api/admin/live-gifts/coin-wallets route is deliberately CoinWallet-based
 * (see its own comment) so someone who never touched the coin economy
 * never appears there - correct for browsing, wrong for this tool, whose
 * whole purpose is granting a *first* coin credit to an account that has
 * none yet (support/testing). Base table here is User; balance is read via
 * an optional one-to-one include and reported as 0 when no wallet exists
 * yet (adjustCoinBalance's own upsert creates the row on first use, so
 * this never needs to create one just to search).
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ results: [] });

  const where: Prisma.UserWhereInput = {
    OR: [
      { username: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { id: q },
    ],
  };

  const users = await prisma.user.findMany({
    where,
    take: 8,
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      badgeType: true,
      banned: true,
      coinWallet: { select: { balance: true } },
    },
  });

  const results = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    avatarUrl: u.avatarUrl,
    badgeType: u.badgeType,
    banned: u.banned,
    balance: u.coinWallet?.balance ?? 0,
  }));

  return NextResponse.json({ results });
}
