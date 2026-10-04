import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";

/**
 * Enable/disable, reprice, or reorder a coin package. Never a DELETE -
 * same "disable instead" reasoning as GiftDefinition's PATCH route,
 * even though CoinPurchase.coinPackageId is onDelete:SetNull here (a
 * deleted package wouldn't corrupt history either way) - staying
 * consistent with every other catalog-style admin surface in this repo.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { id } = await props.params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const data: {
    priceUsdc?: number;
    coinsCredited?: number;
    bonusCoins?: number;
    enabled?: boolean;
    sortOrder?: number;
  } = {};

  if (body.priceUsdc !== undefined) {
    const priceUsdc = Number(body.priceUsdc);
    if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
      return NextResponse.json({ error: "priceUsdc must be a positive amount." }, { status: 400 });
    }
    data.priceUsdc = priceUsdc;
  }
  if (body.coinsCredited !== undefined) {
    const coinsCredited = Number(body.coinsCredited);
    if (!Number.isInteger(coinsCredited) || coinsCredited < 1) {
      return NextResponse.json({ error: "coinsCredited must be a positive whole number." }, { status: 400 });
    }
    data.coinsCredited = coinsCredited;
  }
  if (body.bonusCoins !== undefined) {
    const bonusCoins = Number(body.bonusCoins);
    if (!Number.isInteger(bonusCoins) || bonusCoins < 0) {
      return NextResponse.json({ error: "bonusCoins must be a non-negative whole number." }, { status: 400 });
    }
    data.bonusCoins = bonusCoins;
  }
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder must be a whole number." }, { status: 400 });
    }
    data.sortOrder = body.sortOrder;
  }

  let coinPackage;
  try {
    coinPackage = await prisma.coinPackage.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: "Coin package not found." }, { status: 404 });
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "coin_packages.update",
    targetType: "CoinPackage",
    targetId: id,
    metadata: data,
  });

  return NextResponse.json({ package: coinPackage });
}
