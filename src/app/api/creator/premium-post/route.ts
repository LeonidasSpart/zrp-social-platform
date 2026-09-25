import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// ─── CREATE premium post ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json();
    const { postId, price, previewContent } = body;

    const numericPrice = Number(price);
    if (
      !postId ||
      typeof postId !== "string" ||
      (typeof price !== "number" && typeof price !== "string") ||
      !Number.isFinite(numericPrice) ||
      numericPrice <= 0 ||
      numericPrice > 1_000_000
    ) {
      return NextResponse.json({ error: "Invalid premium post details." }, { status: 400 });
    }
    if (previewContent !== undefined && previewContent !== null && typeof previewContent !== "string") {
      return NextResponse.json({ error: "Invalid premium post details." }, { status: 400 });
    }

    // Check post belongs to user
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, content: true },
    });

    if (!post || post.authorId !== userId) {
      return NextResponse.json({ error: "Post not found or not yours." }, { status: 404 });
    }

    // Check creator profile exists
    const creatorProfile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!creatorProfile || !creatorProfile.premiumPostsEnabled) {
      return NextResponse.json({ error: "Premium posts are not enabled." }, { status: 400 });
    }

    // Create premium post
    let premiumPost;
    try {
      premiumPost = await prisma.premiumPost.create({
        data: {
          postId,
          creatorProfileId: creatorProfile.id,
          price: numericPrice,
          previewContent: (previewContent || post.content.slice(0, 100) + "...").slice(0, 2000),
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "This post is already a premium post." }, { status: 409 });
      }
      throw err;
    }

    return jsonWithDecimals({ premiumPost });
  } catch (error) {
    console.error("Create premium post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET premium post status ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const userId = token?.id;

    const { searchParams } = new URL(req.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json({ error: "Missing postId" }, { status: 400 });
    }

    const premiumPost = await prisma.premiumPost.findUnique({
      where: { postId },
      include: {
        post: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!premiumPost) {
      return NextResponse.json({ isPremium: false });
    }

    // Check if user has purchased
    let hasPurchased = false;
    if (userId) {
      const purchase = await prisma.premiumPurchase.findUnique({
        where: {
          premiumPostId_userId: {
            premiumPostId: premiumPost.id,
            userId,
          },
        },
      });
      hasPurchased = !!purchase;
    }

    const isOwner = userId === premiumPost.post.authorId;
    const canViewFull = hasPurchased || isOwner;

    // ⚠️ SECURITY: `premiumPost.post` is the full Post row (content,
    // imageUrl(s), linkUrl, ...). Spreading it into the response as-is
    // handed the paid content to anyone - including logged-out callers -
    // regardless of `fullContent` below. Only the post's non-gated
    // identity/author fields are returned unless the viewer may see it
    // (same rule as applyPremiumGating in src/lib/premium-content.ts).
    const { post, ...premiumPostFields } = premiumPost;
    const safePost = canViewFull
      ? post
      : { id: post.id, authorId: post.authorId, createdAt: post.createdAt, author: post.author };

    return jsonWithDecimals({
      isPremium: true,
      premiumPost: {
        ...premiumPostFields,
        post: safePost,
        hasPurchased,
        isOwner,
        // Only show full content if purchased or owner
        fullContent: canViewFull ? post.content : null,
        previewContent: premiumPost.previewContent,
        price: premiumPost.price,
      },
    });
  } catch (error) {
    console.error("Get premium post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
