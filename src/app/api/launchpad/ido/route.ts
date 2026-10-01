export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitByIpAndUser } from "@/lib/rate-limit";
// ⚠️ IdoCampaign's Decimal fields (tokenPriceUsdc/softCapUsdc/hardCapUsdc)
// are money-scale USDC figures, NOT raw SPL base units - use the
// Decimal->Number serializer (jsonWithDecimals), never the raw-base-unit
// Decimal->string one (jsonWithDecimalStrings), which truncates to
// whole units via toFixed(0) and silently corrupts a fractional price
// or cap. This is the exact bug Phase 5's admin dashboard fix caught.
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { parseCursorParams, buildPage } from "@/lib/pagination";

const MAX_SALE_DURATION_SECONDS = 180 * 24 * 3600; // 180 days
const MIN_SALE_DURATION_SECONDS = 3600; // 1 hour

/*
 * ⚠️ NON-CUSTODIAL BY DESIGN: this route only ever stores campaign
 * metadata and whitelist decisions. It never accepts, verifies, or
 * moves a contribution - see the IdoCampaign model's doc comment in
 * schema.prisma for why that boundary is deliberate, not missing.
 */

// ─── GET: browse IDO campaigns ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "ido-list" });
    if (!limitCheck.success) return limitCheck.response;

    const campaigns = await prisma.idoCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
        _count: { select: { whitelistApplications: true } },
      },
    });

    const { items, nextCursor } = buildPage(campaigns, limit);
    return jsonWithDecimals({ campaigns: items, nextCursor });
  } catch (error) {
    console.error("Error fetching IDO campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch IDO campaigns" }, { status: 500 });
  }
}

// ─── POST: open an IDO campaign for an already-launched token ─────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "ido-campaign-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const {
      launchedTokenId,
      title,
      description,
      tokenPriceUsdc,
      softCapUsdc,
      hardCapUsdc,
      requiresWhitelist,
      participationInstructions,
      saleStartsAt,
      saleDurationDays,
    } = body;

    if (typeof launchedTokenId !== "string" || !launchedTokenId) {
      return NextResponse.json({ error: "launchedTokenId is required." }, { status: 400 });
    }
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return NextResponse.json({ error: "Title is required (max 120 characters)." }, { status: 400 });
    }
    if (typeof description !== "string" || !description.trim() || description.trim().length > 5000) {
      return NextResponse.json({ error: "Description is required (max 5000 characters)." }, { status: 400 });
    }
    if (typeof participationInstructions !== "string" || !participationInstructions.trim() || participationInstructions.trim().length > 5000) {
      return NextResponse.json(
        { error: "Participation instructions are required (max 5000 characters) - explain how an approved participant actually takes part off-platform." },
        { status: 400 }
      );
    }

    const price = Number(tokenPriceUsdc);
    const softCap = Number(softCapUsdc);
    const hardCap = Number(hardCapUsdc);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Invalid token price." }, { status: 400 });
    }
    if (!Number.isFinite(softCap) || softCap <= 0) {
      return NextResponse.json({ error: "Invalid soft cap." }, { status: 400 });
    }
    if (!Number.isFinite(hardCap) || hardCap < softCap) {
      return NextResponse.json({ error: "Hard cap must be at least the soft cap." }, { status: 400 });
    }

    const startsAt = new Date(saleStartsAt);
    if (Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "Invalid sale start date." }, { status: 400 });
    }
    const durationSeconds = Math.round(Number(saleDurationDays) * 86400);
    if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_SALE_DURATION_SECONDS || durationSeconds > MAX_SALE_DURATION_SECONDS) {
      return NextResponse.json({ error: "Sale duration must be between 1 hour and 180 days." }, { status: 400 });
    }
    const endsAt = new Date(startsAt.getTime() + durationSeconds * 1000);

    const launchedToken = await prisma.launchedToken.findUnique({ where: { id: launchedTokenId } });
    if (!launchedToken || launchedToken.status !== "COMPLETED" || !launchedToken.mintAddress) {
      return NextResponse.json({ error: "Token not found or not yet minted." }, { status: 404 });
    }
    // ⚠️ SECURITY: only this token's own creator may open an IDO
    // campaign for it, same ownership bar as standing up its DAO.
    if (launchedToken.creatorId !== userId) {
      return NextResponse.json({ error: "Only this token's creator can open an IDO campaign for it." }, { status: 403 });
    }

    const campaign = await prisma.idoCampaign.create({
      data: {
        launchedTokenId,
        creatorId: userId,
        title: title.trim(),
        description: description.trim(),
        tokenPriceUsdc: price.toFixed(6),
        softCapUsdc: softCap.toFixed(6),
        hardCapUsdc: hardCap.toFixed(6),
        requiresWhitelist: requiresWhitelist !== false,
        participationInstructions: participationInstructions.trim(),
        saleStartsAt: startsAt,
        saleEndsAt: endsAt,
      },
    });

    return jsonWithDecimals({ campaign }, { status: 201 });
  } catch (error) {
    console.error("IDO campaign creation error:", error);
    return NextResponse.json({ error: "Failed to create IDO campaign. Please try again." }, { status: 500 });
  }
}
