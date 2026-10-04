import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Admin -> Live -> Coin Wallets (mission spec section 5). Base table is
 * CoinWallet, not User - a wallet only exists once someone has actually
 * touched the coin economy (first purchase, or an admin adjustment via
 * adjustCoinBalance's upsert), so a user who never bought coins simply
 * never appears here, which is the correct "nothing to show" behaviour
 * rather than a page listing every platform user with a zero row.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const search = req.nextUrl.searchParams.get("search")?.trim() || "";
  const status = req.nextUrl.searchParams.get("status") || "ALL"; // ALL|ACTIVE|SUSPENDED|RESTRICTED|ZERO|POSITIVE
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "25") || 25));

  const where: Prisma.CoinWalletWhereInput = {};
  let userWhere: Prisma.UserWhereInput = {};

  if (search) {
    userWhere = {
      ...userWhere,
      OR: [
        { username: { contains: search, mode: "insensitive" } },
        { id: search },
      ],
    };
  }

  if (status === "ZERO") where.balance = 0;
  else if (status === "POSITIVE") where.balance = { gt: 0 };
  else if (status === "ACTIVE") userWhere = { ...userWhere, banned: false };
  else if (status === "SUSPENDED") userWhere = { ...userWhere, banned: true };
  else if (status === "RESTRICTED") userWhere = { ...userWhere, giftPolicy: { canSendGifts: false } };

  if (Object.keys(userWhere).length > 0) where.user = userWhere;

  const [wallets, total] = await Promise.all([
    prisma.coinWallet.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
            banned: true,
            giftPolicy: { select: { canSendGifts: true, reason: true } },
          },
        },
      },
    }),
    prisma.coinWallet.count({ where }),
  ]);

  const userIds = wallets.map((w) => w.userId);

  const [purchaseAgg, giftAgg] = userIds.length
    ? await Promise.all([
        prisma.coinPurchase.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _sum: { coinsCredited: true },
          _max: { createdAt: true },
        }),
        prisma.liveGiftTransaction.groupBy({
          by: ["senderId"],
          where: { senderId: { in: userIds } },
          _sum: { totalCoins: true },
          _max: { createdAt: true },
        }),
      ])
    : [[], []];

  const purchaseByUser = new Map(purchaseAgg.map((p) => [p.userId, p]));
  const giftByUser = new Map(giftAgg.map((g) => [g.senderId, g]));

  const rows = wallets.map((w) => {
    const purchase = purchaseByUser.get(w.userId);
    const gift = giftByUser.get(w.userId);
    const status: "ACTIVE" | "SUSPENDED" | "RESTRICTED" = w.user.banned
      ? "SUSPENDED"
      : w.user.giftPolicy && !w.user.giftPolicy.canSendGifts
        ? "RESTRICTED"
        : "ACTIVE";
    return {
      userId: w.userId,
      user: {
        id: w.user.id,
        username: w.user.username,
        name: w.user.name,
        avatarUrl: w.user.avatarUrl,
        badgeType: w.user.badgeType,
      },
      balance: w.balance,
      totalPurchased: purchase?._sum.coinsCredited ?? 0,
      totalSpent: gift?._sum.totalCoins ?? 0,
      lastPurchaseAt: purchase?._max.createdAt ?? null,
      lastGiftAt: gift?._max.createdAt ?? null,
      status,
    };
  });

  return NextResponse.json({ wallets: rows, total, page, limit });
}
