import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

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

    if (!postId || !price || price <= 0) {
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
    const premiumPost = await prisma.premiumPost.create({
      data: {
        postId,
        creatorProfileId: creatorProfile.id,
        price,
        previewContent: previewContent || post.content.slice(0, 100) + "...",
      },
    });

    return NextResponse.json({ premiumPost });
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

    return NextResponse.json({
      isPremium: true,
      premiumPost: {
        ...premiumPost,
        hasPurchased,
        isOwner,
        // Only show full content if purchased or owner
        fullContent: (hasPurchased || isOwner) ? premiumPost.post.content : null,
        previewContent: premiumPost.previewContent,
        price: premiumPost.price,
      },
    });
  } catch (error) {
    console.error("Get premium post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
