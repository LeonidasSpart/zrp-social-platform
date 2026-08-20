import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/**
 * GET /api/news/[slug]
 *
 * Returns one published ZRP News article.
 *
 * Also increments the article view counter.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;

    if (!slug || slug.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Article slug is required",
        },
        { status: 400 }
      );
    }

    const article = await prisma.newsArticle.findFirst({
      where: {
        slug: slug.trim(),
        status: "PUBLISHED",
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImage: true,
        sourceName: true,
        sourceUrl: true,
        category: true,
        status: true,
        views: true,
        featured: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
      },
    });

    if (!article) {
      return NextResponse.json(
        {
          success: false,
          error: "News article not found",
        },
        { status: 404 }
      );
    }

    // Increment the view count without affecting the returned article.
    await prisma.newsArticle.update({
      where: {
        id: article.id,
      },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      article: {
        ...article,
        views: article.views + 1,
      },
    });
  } catch (error) {
    console.error("ZRP News article GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load news article",
      },
      { status: 500 }
    );
  }
}
