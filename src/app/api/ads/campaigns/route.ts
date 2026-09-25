export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { parseAdTargetUrl } from "@/lib/ads/target-url";

// ─── GET: list the current user's own campaigns ─────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await prisma.adCampaign.findMany({
      where: { advertiserId: token.id as string },
      // adminNote is staff-only (see schema.prisma) - never returned here.
      omit: { adminNote: true },
      orderBy: { createdAt: "desc" },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            imageUrls: true,
            mediaType: true,
          },
        },
        _count: {
          select: { impressions: true, clicks: true },
        },
      },
    });

    return jsonWithDecimals({ campaigns });
  } catch (error) {
    console.error("Error listing ad campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

// ─── POST: create a new campaign ─────────────────────────────────────
export async function POST(req: NextRequest) {
  // Campaign creation involves real money and moderation review, so a
  // stricter limit than most write routes - generous enough for a real
  // advertiser setting up several campaigns, tight enough to block abuse.
  const limit = await rateLimit(req, { limit: 10, window: 3600, type: "ads-campaign-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { postId, name, bidType, bidAmount, budgetTotal, targetUrl, startDate, endDate } = body;

    if (!postId || typeof postId !== "string") {
      return NextResponse.json({ error: "A post is required for the ad creative." }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    }
    if (bidType !== "CPC" && bidType !== "CPM") {
      return NextResponse.json({ error: "bidType must be CPC or CPM." }, { status: 400 });
    }

    const numericBid = Number(bidAmount);
    const numericBudget = Number(budgetTotal);
    if (!Number.isFinite(numericBid) || numericBid <= 0) {
      return NextResponse.json({ error: "Invalid bid amount." }, { status: 400 });
    }
    if (!Number.isFinite(numericBudget) || numericBudget < numericBid) {
      return NextResponse.json(
        { error: "Budget must be at least as large as the bid amount." },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: targetUrl is where every viewer's click on this ad is
    // sent (AdCard does `window.location.href = redirectUrl`), and the
    // enforced CSP allows inline script - a `javascript:` URL here would
    // run in every clicking viewer's ZRP session. Only absolute http(s)
    // URLs are accepted.
    let normalizedTargetUrl: string | null = null;
    if (targetUrl !== undefined && targetUrl !== null && targetUrl !== "") {
      normalizedTargetUrl = parseAdTargetUrl(targetUrl);
      if (!normalizedTargetUrl) {
        return NextResponse.json(
          { error: "Destination URL must be a valid http(s) URL." },
          { status: 400 }
        );
      }
    }

    const parsedStart = startDate ? new Date(startDate) : null;
    const parsedEnd = endDate ? new Date(endDate) : null;
    if ((parsedStart && Number.isNaN(parsedStart.getTime())) || (parsedEnd && Number.isNaN(parsedEnd.getTime()))) {
      return NextResponse.json({ error: "Invalid start or end date." }, { status: 400 });
    }

    // The ad creative must be the advertiser's own post - otherwise
    // anyone could promote someone else's content without consent.
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post || post.authorId !== token.id) {
      return NextResponse.json(
        { error: "You can only create a campaign around your own post." },
        { status: 403 }
      );
    }

    // One campaign per post - matches the @@unique([postId]) constraint,
    // but checking first gives a clean error instead of a raw DB error.
    const existing = await prisma.adCampaign.findUnique({ where: { postId } });
    if (existing) {
      return NextResponse.json(
        { error: "This post already has an ad campaign." },
        { status: 409 }
      );
    }

    const campaign = await prisma.adCampaign.create({
      data: {
        advertiserId: token.id as string,
        postId,
        name: name.trim(),
        // New campaigns always start as PENDING_REVIEW, never directly
        // ACTIVE - every ad goes through moderator approval before it
        // can actually serve, matching how content moderation already
        // works elsewhere in this app rather than trusting self-serve
        // submissions to go live unreviewed.
        status: "PENDING_REVIEW",
        bidType,
        bidAmount: numericBid,
        budgetTotal: numericBudget,
        targetUrl: normalizedTargetUrl,
        startDate: parsedStart,
        endDate: parsedEnd,
      },
      omit: { adminNote: true },
    });

    return jsonWithDecimals({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Error creating ad campaign:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
