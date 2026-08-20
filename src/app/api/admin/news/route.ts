import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, NewsArticleCategory, NewsArticleStatus } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
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

    const where: {
      status?: NewsArticleStatus;
      category?: NewsArticleCategory;
      OR?: Array<{
        title?: { contains: string; mode: "insensitive" };
        slug?: { contains: string; mode: "insensitive" };
        excerpt?: { contains: string; mode: "insensitive" };
        content?: { contains: string; mode: "insensitive" };
      }>;
    } = {};

    if (
      statusParam &&
      Object.values(NewsArticleStatus).includes(
        statusParam as NewsArticleStatus
      )
    ) {
      where.status = statusParam as NewsArticleStatus;
    }

    if (
      categoryParam &&
      Object.values(NewsArticleCategory).includes(
        categoryParam as NewsArticleCategory
      )
    ) {
      where.category = categoryParam as NewsArticleCategory;
    }

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          slug: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          excerpt: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          content: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

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

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Title is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Slug is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Content is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!authorId || typeof authorId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Author ID is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      category &&
      !Object.values(NewsArticleCategory).includes(
        category as NewsArticleCategory
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid news category",
        },
        {
          status: 400,
        }
      );
    }

    if (
      status &&
      !Object.values(NewsArticleStatus).includes(
        status as NewsArticleStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid news status",
        },
        {
          status: 400,
        }
      );
    }

    const existingSlug = await prisma.newsArticle.findUnique({
      where: {
        slug,
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
        {
          status: 409,
        }
      );
    }

    const articleStatus =
      (status as NewsArticleStatus | undefined) ||
      NewsArticleStatus.DRAFT;

    const article = await prisma.newsArticle.create({
      data: {
        title: title.trim(),
        slug: slug.trim(),
        excerpt:
          typeof excerpt === "string" && excerpt.trim()
            ? excerpt.trim()
            : null,
        content,
        coverImage:
          typeof coverImage === "string" && coverImage.trim()
            ? coverImage.trim()
            : null,
        sourceName:
          typeof sourceName === "string" && sourceName.trim()
            ? sourceName.trim()
            : null,
        sourceUrl:
          typeof sourceUrl === "string" && sourceUrl.trim()
            ? sourceUrl.trim()
            : null,
        category:
          (category as NewsArticleCategory | undefined) ||
          NewsArticleCategory.WORLD,
        status: articleStatus,
        authorId,
        views:
          typeof views === "number" && views >= 0
            ? Math.floor(views)
            : 0,
        featured: Boolean(featured),
        publishedAt:
          publishedAt
            ? new Date(publishedAt)
            : articleStatus === NewsArticleStatus.PUBLISHED
              ? new Date()
              : null,
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
