import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

    const category = searchParams.get("category");
    const featured = searchParams.get("featured");
    const cursor = searchParams.get("cursor");

    const requestedLimit = Number(searchParams.get("limit") || "20");

    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20, 1),
      50
    );

    const where: any = {
      status: "PUBLISHED",
      publishedAt: {
        not: null,
      },
    };

    if (category) {
      const allowedCategories = [
        "WORLD",
        "EUROPE",
        "SWITZERLAND",
        "POLITICS",
        "BUSINESS",
        "TECHNOLOGY",
        "CRYPTO",
        "SCIENCE",
        "SPORTS",
        "CULTURE",
        "COMMUNITY",
      ];

      if (!allowedCategories.includes(category.toUpperCase())) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid news category",
          },
          { status: 400 }
        );
      }

      where.category = category.toUpperCase();
    }

    if (featured === "true") {
      where.featured = true;
    }

    if (cursor) {
      const cursorDate = new Date(cursor);

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

    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: {
        publishedAt: "desc",
      },
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

    const hasMore = articles.length > limit;

    const results = hasMore ? articles.slice(0, limit) : articles;

    const nextCursor =
      hasMore && results.length > 0
        ? results[results.length - 1].publishedAt?.toISOString() ?? null
        : null;

    return NextResponse.json({
      success: true,
      articles: results,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    });
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
