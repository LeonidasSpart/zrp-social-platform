export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { HELP_CATEGORIES, HELP_NEED_TYPES, type HelpCategory, type HelpNeedType } from "@/lib/help";
import { Prisma } from "@prisma/client";

const ORGANIZER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: browse active humanitarian campaigns ───────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const category = req.nextUrl.searchParams.get("category");
    const needType = req.nextUrl.searchParams.get("needType");

    const where: Prisma.HelpCampaignWhereInput = { status: "ACTIVE" };
    if (category && (HELP_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category as HelpCategory;
    }
    if (needType && (HELP_NEED_TYPES as readonly string[]).includes(needType)) {
      where.needTypes = { has: needType as HelpNeedType };
    }

    const campaigns = await prisma.helpCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        category: true,
        needTypes: true,
        title: true,
        description: true,
        location: true,
        goalAmount: true,
        currency: true,
        raisedAmount: true,
        imageUrls: true,
        createdAt: true,
        organizer: { select: ORGANIZER_SELECT },
      },
    });

    const { items, nextCursor } = buildPage(campaigns, limit);
    return jsonWithDecimals({ campaigns: items, nextCursor });
  } catch (error) {
    console.error("Error fetching HELP campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

// ─── POST: create a campaign - verified organizations only ──────────
// "Verified organization" reuses the exact same signal already
// surfaced on Trust Passport (badgeType === "organization", granted
// by a full admin) - no new verification system. PENDING_REVIEW gate
// same as Listing/OpportunityListing.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 5, window: 3600, type: "help-campaign-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { badgeType: true },
    });
    if (user?.badgeType !== "organization") {
      return NextResponse.json(
        { error: "Only verified organizations can publish a ZRP HELP campaign. Contact support to get verified." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { category, needTypes, title, description, location, goalAmount, currency, imageUrls, proofUrls } = body;

    if (!category || !(HELP_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "A valid category is required." }, { status: 400 });
    }
    const cleanNeedTypes = Array.isArray(needTypes)
      ? needTypes.filter((n): n is HelpNeedType => (HELP_NEED_TYPES as readonly string[]).includes(n))
      : [];
    if (cleanNeedTypes.length === 0) {
      return NextResponse.json({ error: "At least one need type is required." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 150) {
      return NextResponse.json({ error: "Title is required (max 150 characters)." }, { status: 400 });
    }
    if (!description || typeof description !== "string" || !description.trim() || description.trim().length > 8000) {
      return NextResponse.json({ error: "Description is required (max 8000 characters)." }, { status: 400 });
    }

    let cleanGoalAmount: number | null = null;
    if (cleanNeedTypes.includes("MONEY")) {
      const numericGoal = Number(goalAmount);
      if (!Number.isFinite(numericGoal) || numericGoal <= 0) {
        return NextResponse.json(
          { error: "A goal amount is required for campaigns that need money." },
          { status: 400 }
        );
      }
      cleanGoalAmount = numericGoal;
    }

    const cleanImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 15)
      : [];
    const cleanProofUrls = Array.isArray(proofUrls)
      ? proofUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 10)
      : [];

    const campaign = await prisma.helpCampaign.create({
      data: {
        organizerId: token.id as string,
        category: category as HelpCategory,
        needTypes: cleanNeedTypes,
        title: title.trim(),
        description: description.trim(),
        location: typeof location === "string" ? location.trim().slice(0, 150) || null : null,
        goalAmount: cleanGoalAmount,
        currency: typeof currency === "string" && currency.trim() ? currency.trim().slice(0, 10) : "USDC",
        imageUrls: cleanImageUrls,
        proofUrls: cleanProofUrls,
        status: "PENDING_REVIEW",
      },
    });

    return jsonWithDecimals({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Error creating HELP campaign:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
