import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { parseMediaUrl } from "@/lib/media-url";

/** https-only, well-formed URL, or null/empty (both fields are optional). */
function validOptionalUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && parseMediaUrl(value) !== null;
}

/** Full catalog including disabled gifts - the public /api/live/gifts only ever returns enabled ones. */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const gifts = await prisma.giftDefinition.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ gifts });
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const priceCoins = Number(body?.priceCoins);

  if (!key || typeof key !== "string" || !/^[a-z0-9_-]+$/.test(key)) {
    return NextResponse.json({ error: "key must be a lowercase slug (letters, numbers, _ or -)." }, { status: 400 });
  }
  if (!Number.isInteger(priceCoins) || priceCoins < 1) {
    return NextResponse.json({ error: "priceCoins must be a positive whole number." }, { status: 400 });
  }
  if (!validOptionalUrl(body.iconUrl)) {
    return NextResponse.json({ error: "iconUrl must be a valid https:// URL." }, { status: 400 });
  }
  if (!validOptionalUrl(body.animationUrl)) {
    return NextResponse.json({ error: "animationUrl must be a valid https:// URL." }, { status: 400 });
  }
  if (body.sortOrder !== undefined && !Number.isInteger(body.sortOrder)) {
    return NextResponse.json({ error: "sortOrder must be a whole number." }, { status: 400 });
  }

  const existing = await prisma.giftDefinition.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json({ error: "A gift with this key already exists." }, { status: 409 });
  }

  const gift = await prisma.giftDefinition.create({
    data: {
      key,
      priceCoins,
      iconUrl: typeof body.iconUrl === "string" ? body.iconUrl : null,
      animationUrl: typeof body.animationUrl === "string" ? body.animationUrl : null,
      enabled: body.enabled !== false,
      sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: "live_gifts.create",
    targetType: "GiftDefinition",
    targetId: gift.id,
    metadata: { key, priceCoins },
  });

  return NextResponse.json({ gift }, { status: 201 });
}
