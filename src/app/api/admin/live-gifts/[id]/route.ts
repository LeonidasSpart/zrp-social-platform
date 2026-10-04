import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { parseMediaUrl } from "@/lib/media-url";
import { PLAN_RANK, type Plan } from "@/lib/limits";

function validOptionalUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && parseMediaUrl(value) !== null;
}

const VALID_RARITIES = new Set(["COMMON", "RARE", "EPIC", "LEGENDARY"]);
const VALID_PLANS = new Set(Object.keys(PLAN_RANK));

function validOptionalRarity(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && VALID_RARITIES.has(value);
}

function validOptionalPlan(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && VALID_PLANS.has(value);
}

function parseOptionalDate(value: unknown): { ok: true; date: Date | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, date: null };
  if (typeof value !== "string" && typeof value !== "number") return { ok: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, date };
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
    soundUrl?: string | null;
    category?: string | null;
    rarity?: string | null;
    minTier?: Plan | null;
    availableFrom?: Date | null;
    availableTo?: Date | null;
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
  if (body.soundUrl !== undefined) {
    if (!validOptionalUrl(body.soundUrl)) {
      return NextResponse.json({ error: "soundUrl must be a valid https:// URL." }, { status: 400 });
    }
    data.soundUrl = typeof body.soundUrl === "string" && body.soundUrl ? body.soundUrl : null;
  }
  if (body.category !== undefined) {
    if (body.category !== null && body.category !== "" && (typeof body.category !== "string" || body.category.length > 40)) {
      return NextResponse.json({ error: "category must be a string of at most 40 characters." }, { status: 400 });
    }
    data.category = typeof body.category === "string" && body.category ? body.category : null;
  }
  if (body.rarity !== undefined) {
    if (!validOptionalRarity(body.rarity)) {
      return NextResponse.json({ error: "rarity must be one of COMMON, RARE, EPIC, LEGENDARY." }, { status: 400 });
    }
    data.rarity = typeof body.rarity === "string" && body.rarity ? body.rarity : null;
  }
  if (body.minTier !== undefined) {
    if (!validOptionalPlan(body.minTier)) {
      return NextResponse.json({ error: "minTier must be a valid plan (free, pro, business, enterprise) or null." }, { status: 400 });
    }
    data.minTier = typeof body.minTier === "string" && body.minTier ? (body.minTier as Plan) : null;
  }
  if (body.availableFrom !== undefined) {
    const parsed = parseOptionalDate(body.availableFrom);
    if (!parsed.ok) return NextResponse.json({ error: "availableFrom must be a valid date." }, { status: 400 });
    data.availableFrom = parsed.date;
  }
  if (body.availableTo !== undefined) {
    const parsed = parseOptionalDate(body.availableTo);
    if (!parsed.ok) return NextResponse.json({ error: "availableTo must be a valid date." }, { status: 400 });
    data.availableTo = parsed.date;
  }

  // A partial update (only one of the two bounds sent) must still be
  // checked against the OTHER bound's persisted value, not just the
  // field(s) this request happened to touch - validated before any
  // write, never fixed up after a bad write lands.
  if (data.availableFrom !== undefined || data.availableTo !== undefined) {
    const existingGift = await prisma.giftDefinition.findUnique({ where: { id }, select: { availableFrom: true, availableTo: true } });
    if (!existingGift) return NextResponse.json({ error: "Gift not found." }, { status: 404 });
    const effectiveFrom = data.availableFrom !== undefined ? data.availableFrom : existingGift.availableFrom;
    const effectiveTo = data.availableTo !== undefined ? data.availableTo : existingGift.availableTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      return NextResponse.json({ error: "availableFrom must be before or equal to availableTo." }, { status: 400 });
    }
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
