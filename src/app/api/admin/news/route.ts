import { NextRequest, NextResponse } from "next/server";
import {
  NewsArticleCategory,
  NewsArticleStatus,
} from "@prisma/client";
// SECURITY FIX: these routes previously had no server-side auth check
// at all: any signed-in (or signed-out) request could list, create,
// or edit ZRP News articles. requireStaff (ADMIN or MODERATOR) matches
// the guard already used on the other admin content-moderation routes
// (e.g. /api/admin/users, /api/admin/posts).
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

function isValidDate(value: unknown): value is string | Date {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

/**
 * GET /api/admin/news
 *
 * Returns news articles for the admin panel.
 *
 * Supported query parameters:
 * - status
 * - category
 * - search
 * - page
 * - limit
 */
export async function GET(request: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get("status");
    const categoryParam = searchParams.get("category");
    const search = searchParams.get("search")?.trim() || "";

    const pageParam = Number(searchParams.get("page") || "1");
    const limitParam = Number(searchParams.get("limit") || "20");

    const page =
      Number.isFinite(pageParam) && pageParam > 0
        ? Math.floor(pageParam)
        : 1;

    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), 100)
        : 20;

    const skip = (page - 1) * limit;

    const where = {
      ...(statusParam &&
      Object.values(NewsArticleStatus).includes(
        statusParam as NewsArticleStatus
      )
        ? {
            status: statusParam as NewsArticleStatus,
          }
        : {}),

      ...(categoryParam &&
      Object.values(NewsArticleCategory).includes(
        categoryParam as NewsArticleCategory
      )
        ? {
            category: categoryParam as NewsArticleCategory,
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                slug: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                excerpt: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                content: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [articles, total] = await Promise.all([
      prisma.newsArticle.findMany({
        where,
        orderBy: [
          {
            featured: "desc",
          },
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
        include: {
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
      }),

      prisma.newsArticle.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/news error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load news articles",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST /api/admin/news
 *
 * Creates a new news article.
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await request.json();

    const {
      title,
      slug,
      excerpt,
      content,
      coverImage,
      sourceName,
      sourceUrl,
      category,
      status,
      authorId,
      views,
      featured,
      publishedAt,
    } = body;

    /*
     * Basic validation
     */
    if (
      typeof title !== "string" ||
      !title.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Title is required",
        },
        { status: 400 }
      );
    }

    if (
      typeof slug !== "string" ||
      !slug.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Slug is required",
        },
        { status: 400 }
      );
    }

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Content is required",
        },
        { status: 400 }
      );
    }

    if (
      typeof authorId !== "string" ||
      !authorId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Author ID is required",
        },
        { status: 400 }
      );
    }

    /*
     * Validate category
     */
    const articleCategory =
      category === undefined ||
      category === null ||
      category === ""
        ? NewsArticleCategory.WORLD
        : category;

    if (
      !Object.values(NewsArticleCategory).includes(
        articleCategory as NewsArticleCategory
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

    /*
     * Validate status
     */
    const articleStatus =
      status === undefined ||
      status === null ||
      status === ""
        ? NewsArticleStatus.DRAFT
        : status;

    if (
      !Object.values(NewsArticleStatus).includes(
        articleStatus as NewsArticleStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid news status",
        },
        { status: 400 }
      );
    }

    /*
     * Validate publishedAt if provided.
     */
    let parsedPublishedAt: Date | null = null;

    if (publishedAt !== undefined && publishedAt !== null && publishedAt !== "") {
      if (!isValidDate(publishedAt)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid publishedAt date",
          },
          { status: 400 }
        );
      }

      parsedPublishedAt = new Date(publishedAt);
    } else if (
      articleStatus === NewsArticleStatus.PUBLISHED
    ) {
      parsedPublishedAt = new Date();
    }

    /*
     * Validate views.
     */
    let articleViews = 0;

    if (views !== undefined && views !== null) {
      const numericViews = Number(views);

      if (
        !Number.isFinite(numericViews) ||
        numericViews < 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Views must be a valid non-negative number",
          },
          { status: 400 }
        );
      }

      articleViews = Math.floor(numericViews);
    }

    /*
     * Verify author exists.
     */
    const author = await prisma.user.findUnique({
      where: {
        id: authorId.trim(),
      },
      select: {
        id: true,
      },
    });

    if (!author) {
      return NextResponse.json(
        {
          success: false,
          error: "Author not found",
        },
        { status: 400 }
      );
    }

    /*
     * Check slug uniqueness.
     */
    const cleanSlug = slug.trim();

    const existingSlug = await prisma.newsArticle.findUnique({
      where: {
        slug: cleanSlug,
      },
      select: {
        id: true,
      },
    });

    if (existingSlug) {
      return NextResponse.json(
        {
          success: false,
          error: "An article with this slug already exists",
        },
        { status: 409 }
      );
    }

    /*
     * If this article is being created as featured,
     * remove featured status from the existing article(s).
     */
    if (Boolean(featured)) {
      await prisma.newsArticle.updateMany({
        where: {
          featured: true,
        },
        data: {
          featured: false,
        },
      });
    }

    /*
     * Create article.
     */
    const article = await prisma.newsArticle.create({
      data: {
        title: title.trim(),

        slug: cleanSlug,

        excerpt:
          typeof excerpt === "string" &&
          excerpt.trim()
            ? excerpt.trim()
            : null,

        content: content.trim(),

        coverImage:
          typeof coverImage === "string" &&
          coverImage.trim()
            ? coverImage.trim()
            : null,

        sourceName:
          typeof sourceName === "string" &&
          sourceName.trim()
            ? sourceName.trim()
            : null,

        sourceUrl:
          typeof sourceUrl === "string" &&
          sourceUrl.trim()
            ? sourceUrl.trim()
            : null,

        category:
          articleCategory as NewsArticleCategory,

        status:
          articleStatus as NewsArticleStatus,

        authorId: authorId.trim(),

        views: articleViews,

        featured: Boolean(featured),

        publishedAt: parsedPublishedAt,
      },

      include: {
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

    return NextResponse.json(
      {
        success: true,
        article,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("POST /api/admin/news error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create news article",
      },
      {
        status: 500,
      }
    );
  }
}
