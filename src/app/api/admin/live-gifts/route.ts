import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { parseMediaUrl } from "@/lib/media-url";
import { PLAN_RANK, type Plan } from "@/lib/limits";

/** https-only, well-formed URL, or null/empty (both fields are optional). */
function validOptionalUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && parseMediaUrl(value) !== null;
}

const VALID_RARITIES = new Set(["COMMON", "RARE", "EPIC", "LEGENDARY"]);
const VALID_PLANS = new Set(Object.keys(PLAN_RANK));

/** Cosmetic/organizational tier only - not a DB enum so admin APIs can validate without a migration. */
function validOptionalRarity(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && VALID_RARITIES.has(value);
}

/** Nullable plan gate - must be a real Plan value or absent/null (no restriction). */
function validOptionalPlan(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && VALID_PLANS.has(value);
}

/** A valid Date, or null/undefined (unbounded on that side). */
function parseOptionalDate(value: unknown): { ok: true; date: Date | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, date: null };
  if (typeof value !== "string" && typeof value !== "number") return { ok: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, date };
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
  if (!validOptionalUrl(body.soundUrl)) {
    return NextResponse.json({ error: "soundUrl must be a valid https:// URL." }, { status: 400 });
  }
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    if (typeof body.category !== "string" || body.category.length > 40) {
      return NextResponse.json({ error: "category must be a string of at most 40 characters." }, { status: 400 });
    }
  }
  if (!validOptionalRarity(body.rarity)) {
    return NextResponse.json({ error: "rarity must be one of COMMON, RARE, EPIC, LEGENDARY." }, { status: 400 });
  }
  if (!validOptionalPlan(body.minTier)) {
    return NextResponse.json({ error: "minTier must be a valid plan (free, pro, business, enterprise) or null." }, { status: 400 });
  }
  const availableFrom = parseOptionalDate(body.availableFrom);
  if (!availableFrom.ok) {
    return NextResponse.json({ error: "availableFrom must be a valid date." }, { status: 400 });
  }
  const availableTo = parseOptionalDate(body.availableTo);
  if (!availableTo.ok) {
    return NextResponse.json({ error: "availableTo must be a valid date." }, { status: 400 });
  }
  if (availableFrom.date && availableTo.date && availableFrom.date > availableTo.date) {
    return NextResponse.json({ error: "availableFrom must be before or equal to availableTo." }, { status: 400 });
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
      soundUrl: typeof body.soundUrl === "string" ? body.soundUrl : null,
      category: typeof body.category === "string" && body.category ? body.category : null,
      rarity: typeof body.rarity === "string" && body.rarity ? (body.rarity as string) : null,
      minTier: typeof body.minTier === "string" && body.minTier ? (body.minTier as Plan) : null,
      availableFrom: availableFrom.date,
      availableTo: availableTo.date,
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
