import { NextRequest, NextResponse } from "next/server";
import { NewsArticleCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_CATEGORIES = Object.values(NewsArticleCategory);

/**
 * GET /api/news
 *
 * Public ZRP News feed.
 *
 * Supported query parameters:
 * ?category=WORLD
 * ?featured=true
 * ?limit=20
 * ?cursor=<publishedAt ISO date>
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const categoryParam = searchParams.get("category");
    const featuredParam = searchParams.get("featured");
    const cursorParam = searchParams.get("cursor");

    const requestedLimit = Number(
      searchParams.get("limit") || "20"
    );

    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 50)
        : 20;

    const where: Prisma.NewsArticleWhereInput = {
      status: "PUBLISHED",
      publishedAt: {
        not: null,
      },
    };

    /*
     * Category filter
     */
    if (categoryParam) {
      const normalizedCategory =
        categoryParam.toUpperCase();

      if (
        !ALLOWED_CATEGORIES.includes(
          normalizedCategory as NewsArticleCategory
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid news category",
          },
          { status: 400 }
        );
      }

      where.category =
        normalizedCategory as NewsArticleCategory;
    }

    /*
     * Featured filter
     */
    if (featuredParam === "true") {
      where.featured = true;
    }

    /*
     * Cursor pagination
     *
     * The cursor is the publishedAt timestamp
     * returned by the previous request.
     */
    if (cursorParam) {
      const cursorDate = new Date(cursorParam);

      if (Number.isNaN(cursorDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid cursor",
          },
          { status: 400 }
        );
      }

      where.publishedAt = {
        not: null,
        lt: cursorDate,
      };
    }

    /*
     * Fetch one extra article so we can determine
     * whether another page exists.
     */
    const articles = await prisma.newsArticle.findMany({
      where,

      orderBy: [
        {
          publishedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],

      take: limit + 1,

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

    const hasMore = articles.length > limit;

    const results = hasMore
      ? articles.slice(0, limit)
      : articles;

    const lastArticle =
      results.length > 0
        ? results[results.length - 1]
        : null;

    const nextCursor =
      hasMore && lastArticle?.publishedAt
        ? lastArticle.publishedAt.toISOString()
        : null;

    return NextResponse.json(
      {
        success: true,

        articles: results,

        pagination: {
          limit,
          hasMore,
          nextCursor,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("ZRP News GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load news",
      },
      { status: 500 }
    );
  }
}
