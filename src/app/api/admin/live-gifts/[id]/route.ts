import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { parseMediaUrl } from "@/lib/media-url";

function validOptionalUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && parseMediaUrl(value) !== null;
}

/** Enable/disable, reprice, or reorder a catalog gift. Never a DELETE - GiftDefinition is onDelete:Restrict so a priced, already-sent gift can't be removed out from under its ledger; disable it instead. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { id } = await props.params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const data: {
    priceCoins?: number;
    iconUrl?: string | null;
    animationUrl?: string | null;
    enabled?: boolean;
    sortOrder?: number;
  } = {};

  if (body.priceCoins !== undefined) {
    const priceCoins = Number(body.priceCoins);
    if (!Number.isInteger(priceCoins) || priceCoins < 1) {
      return NextResponse.json({ error: "priceCoins must be a positive whole number." }, { status: 400 });
    }
    data.priceCoins = priceCoins;
  }
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder must be a whole number." }, { status: 400 });
    }
    data.sortOrder = body.sortOrder;
  }
  if (body.iconUrl !== undefined) {
    if (!validOptionalUrl(body.iconUrl)) {
      return NextResponse.json({ error: "iconUrl must be a valid https:// URL." }, { status: 400 });
    }
    data.iconUrl = typeof body.iconUrl === "string" && body.iconUrl ? body.iconUrl : null;
  }
  if (body.animationUrl !== undefined) {
    if (!validOptionalUrl(body.animationUrl)) {
      return NextResponse.json({ error: "animationUrl must be a valid https:// URL." }, { status: 400 });
    }
    data.animationUrl = typeof body.animationUrl === "string" && body.animationUrl ? body.animationUrl : null;
  }

  let gift;
  try {
    gift = await prisma.giftDefinition.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: "Gift not found." }, { status: 404 });
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "live_gifts.update",
    targetType: "GiftDefinition",
    targetId: id,
    metadata: data,
  });

  return NextResponse.json({ gift });
}
