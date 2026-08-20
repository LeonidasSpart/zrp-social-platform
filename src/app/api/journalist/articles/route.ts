import { NextRequest, NextResponse } from "next/server";
import { NewsArticleCategory, NewsArticleStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireJournalistRole } from "@/lib/journalist";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// Journalists may only ever see/manage their own articles through this
// route. Statuses a journalist is allowed to move an article into
// directly (PUBLISHED/ARCHIVED remain admin-only, enforced server-side).
const JOURNALIST_WRITABLE_STATUSES: NewsArticleStatus[] = ["DRAFT", "PENDING_REVIEW"];

/**
 * GET /api/journalist/articles
 *
 * List the signed-in journalist's own articles (any status), for the
 * Journalist Dashboard / article list. Supports ?status= filtering.
 */
export async function GET(request: NextRequest) {
  const check = await requireJournalistRole();
  if (!check.authorized) return check.response;

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const pageParam = Number(searchParams.get("page") || "1");
    const limitParam = Number(searchParams.get("limit") || "20");

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit =
      Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 50) : 20;

    const where: Prisma.NewsArticleWhereInput = {
      authorId: check.session.user.id,
      ...(statusParam && Object.values(NewsArticleStatus).includes(statusParam as NewsArticleStatus)
        ? { status: statusParam as NewsArticleStatus }
        : {}),
    };

    const [articles, total] = await Promise.all([
      prisma.newsArticle.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: AUTHOR_SELECT } },
      }),
      prisma.newsArticle.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("GET /api/journalist/articles error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load your articles" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/journalist/articles
 *
 * Create a new article as the signed-in journalist. authorId is never
 * accepted from the request body — it is always the current session
 * user, to prevent journalists from attributing articles to someone
 * else.
 *
 * `status` may only be DRAFT or PENDING_REVIEW here. Submitting directly
 * for review (PENDING_REVIEW) requires the journalist to be VERIFIED.
 */
export async function POST(request: NextRequest) {
  const check = await requireJournalistRole();
  if (!check.authorized) return check.response;

  if (check.journalistStatus === "SUSPENDED") {
    return NextResponse.json(
      { success: false, error: "Your journalist account is suspended." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

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
    } = body;

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ success: false, error: "Title is required" }, { status: 400 });
    }

    if (typeof slug !== "string" || !slug.trim()) {
      return NextResponse.json({ success: false, error: "Slug is required" }, { status: 400 });
    }

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
    }

    const articleCategory =
      category && Object.values(NewsArticleCategory).includes(category)
        ? (category as NewsArticleCategory)
        : NewsArticleCategory.WORLD;

    const requestedStatus =
      status && JOURNALIST_WRITABLE_STATUSES.includes(status) ? (status as NewsArticleStatus) : "DRAFT";

    if (requestedStatus === "PENDING_REVIEW" && check.journalistStatus !== "VERIFIED") {
      return NextResponse.json(
        { success: false, error: "Only verified journalists can submit articles for review." },
        { status: 403 }
      );
    }

    const cleanSlug = slug.trim();

    const existingSlug = await prisma.newsArticle.findUnique({
      where: { slug: cleanSlug },
      select: { id: true },
    });

    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: "An article with this slug already exists" },
        { status: 409 }
      );
    }

    const article = await prisma.newsArticle.create({
      data: {
        title: title.trim(),
        slug: cleanSlug,
        excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
        content: content.trim(),
        coverImage: typeof coverImage === "string" && coverImage.trim() ? coverImage.trim() : null,
        sourceName: typeof sourceName === "string" && sourceName.trim() ? sourceName.trim() : null,
        sourceUrl: typeof sourceUrl === "string" && sourceUrl.trim() ? sourceUrl.trim() : null,
        category: articleCategory,
        status: requestedStatus,
        authorId: check.session.user.id,
        submittedAt: requestedStatus === "PENDING_REVIEW" ? new Date() : null,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });

    return NextResponse.json({ success: true, article }, { status: 201 });
  } catch (error) {
    console.error("POST /api/journalist/articles error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create article" },
      { status: 500 }
    );
  }
}
