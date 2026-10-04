import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";

/** Full catalog including disabled packages - the public /api/wallet/coins/packages only ever returns enabled ones. */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const packages = await prisma.coinPackage.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ packages });
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const priceUsdc = Number(body?.priceUsdc);
  const coinsCredited = Number(body?.coinsCredited);
  const bonusCoins = body?.bonusCoins === undefined ? 0 : Number(body.bonusCoins);

  if (!key || typeof key !== "string" || !/^[a-z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key must be a lowercase slug (letters, numbers, _ or -)." }, { status: 400 });
  }
  if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
    return NextResponse.json({ error: "priceUsdc must be a positive amount." }, { status: 400 });
  }
  if (!Number.isInteger(coinsCredited) || coinsCredited < 1) {
    return NextResponse.json({ error: "coinsCredited must be a positive whole number." }, { status: 400 });
  }
  if (!Number.isInteger(bonusCoins) || bonusCoins < 0) {
    return NextResponse.json({ error: "bonusCoins must be a non-negative whole number." }, { status: 400 });
  }
  if (body.sortOrder !== undefined && !Number.isInteger(body.sortOrder)) {
    return NextResponse.json({ error: "sortOrder must be a whole number." }, { status: 400 });
  }

  const existing = await prisma.coinPackage.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json({ error: "A coin package with this key already exists." }, { status: 409 });
  }

  const coinPackage = await prisma.coinPackage.create({
    data: {
      key,
      priceUsdc,
      coinsCredited,
      bonusCoins,
      enabled: body.enabled !== false,
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: "coin_packages.create",
    targetType: "CoinPackage",
    targetId: coinPackage.id,
    metadata: { key, priceUsdc, coinsCredited, bonusCoins },
  });

  return NextResponse.json({ package: coinPackage }, { status: 201 });
}
