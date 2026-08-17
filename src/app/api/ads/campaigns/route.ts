export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ─── GET: list the current user's own campaigns ─────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await prisma.adCampaign.findMany({
      where: { advertiserId: token.id as string },
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

    return NextResponse.json({ campaigns });
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
        targetUrl: targetUrl || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Error creating ad campaign:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
