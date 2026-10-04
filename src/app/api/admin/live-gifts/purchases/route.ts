import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Admin -> Live -> Coin Purchases (mission spec section 11). Every row
 * here was already verified against a real on-chain USDC transaction by
 * purchaseCoins() (src/lib/live-gifts/gift-service.ts, same
 * verifyUsdcTransaction + ConsumedPaymentTransaction idempotency rail as
 * Tip/PremiumPurchase) at the moment it was created - this route is
 * read-only visibility, never a second verification path, and never
 * trusts anything the client might claim about a purchase's status.
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const status = sp.get("status") || ""; // PENDING | COMPLETED | FAILED (TransactionStatus)
  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "25") || 25));

  const where: Prisma.CoinPurchaseWhereInput = {};
  if (status) where.status = status as Prisma.CoinPurchaseWhereInput["status"];
  if (search) {
    where.OR = [
      { id: search },
      { transactionId: search },
      { user: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.coinPurchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
    }),
    prisma.coinPurchase.count({ where }),
  ]);

  const purchases = rows.map((p) => ({
    id: p.id,
    user: p.user,
    usdcAmount: Number(p.usdcAmount),
    coinsCredited: p.coinsCredited,
    transactionId: p.transactionId,
    status: p.status,
    createdAt: p.createdAt,
  }));

  return NextResponse.json({ purchases, total, page, limit });
}
