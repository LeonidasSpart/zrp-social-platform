import { NextRequest, NextResponse } from "next/server";
import {
  NewsArticleCategory,
  NewsArticleStatus,
} from "@prisma/client";
// SECURITY FIX: see /api/admin/news/route.ts — these routes had no
// server-side auth check at all.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * GET /api/admin/news/[id]
 *
 * Get one news article.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Article ID is required",
        },
        { status: 400 }
      );
    }

    const article = await prisma.newsArticle.findUnique({
      where: {
        id,
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

    if (!article) {
      return NextResponse.json(
        {
          success: false,
          error: "News article not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error("GET /api/admin/news/[id] error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load news article",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/news/[id]
 *
 * Update a news article.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Article ID is required",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.newsArticle.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "News article not found",
        },
        { status: 404 }
      );
    }

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
      reviewNote,
    } = body;

    if (
      category !== undefined &&
      !Object.values(NewsArticleCategory).includes(
        category as NewsArticleCategory
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

    if (
      status !== undefined &&
      !Object.values(NewsArticleStatus).includes(
        status as NewsArticleStatus
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

    if (slug !== undefined && slug !== existing.slug) {
      const slugOwner = await prisma.newsArticle.findFirst({
        where: {
          slug: String(slug).trim(),
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (slugOwner) {
        return NextResponse.json(
          {
            success: false,
            error: "An article with this slug already exists",
          },
          { status: 409 }
        );
      }
    }

    if (
      title !== undefined &&
      (typeof title !== "string" || !title.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Title cannot be empty",
        },
        { status: 400 }
      );
    }

    if (
      content !== undefined &&
      (typeof content !== "string" || !content.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Content cannot be empty",
        },
        { status: 400 }
      );
    }

    if (
      authorId !== undefined &&
      (typeof authorId !== "string" || !authorId.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Author ID cannot be empty",
        },
        { status: 400 }
      );
    }

    if (authorId !== undefined && authorId !== existing.authorId) {
      const author = await prisma.user.findUnique({
        where: {
          id: authorId,
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
    }

    const nextStatus =
      status !== undefined
        ? (status as NewsArticleStatus)
        : existing.status;

    let nextPublishedAt: Date | null | undefined;

    if (publishedAt !== undefined) {
      nextPublishedAt = publishedAt
        ? new Date(publishedAt)
        : null;
    } else if (
      nextStatus === NewsArticleStatus.PUBLISHED &&
      !existing.publishedAt
    ) {
      nextPublishedAt = new Date();
    } else if (
      nextStatus !== NewsArticleStatus.PUBLISHED &&
      status !== undefined
    ) {
      nextPublishedAt = null;
    }

    const data: {
      title?: string;
      slug?: string;
      excerpt?: string | null;
      content?: string;
      coverImage?: string | null;
      sourceName?: string | null;
      sourceUrl?: string | null;
      category?: NewsArticleCategory;
      status?: NewsArticleStatus;
      authorId?: string;
      views?: number;
      featured?: boolean;
      publishedAt?: Date | null;
      reviewNote?: string | null;
      reviewedAt?: Date;
      reviewedById?: string;
    } = {};

    if (title !== undefined) {
      data.title = title.trim();
    }

    if (slug !== undefined) {
      data.slug = String(slug).trim();
    }

    if (excerpt !== undefined) {
      data.excerpt =
        typeof excerpt === "string" && excerpt.trim()
          ? excerpt.trim()
          : null;
    }

    if (content !== undefined) {
      data.content = content;
    }

    if (coverImage !== undefined) {
      data.coverImage =
        typeof coverImage === "string" && coverImage.trim()
          ? coverImage.trim()
          : null;
    }

    if (sourceName !== undefined) {
      data.sourceName =
        typeof sourceName === "string" && sourceName.trim()
          ? sourceName.trim()
          : null;
    }

    if (sourceUrl !== undefined) {
      data.sourceUrl =
        typeof sourceUrl === "string" && sourceUrl.trim()
          ? sourceUrl.trim()
          : null;
    }

    if (category !== undefined) {
      data.category = category as NewsArticleCategory;
    }

    if (status !== undefined) {
      data.status = status as NewsArticleStatus;

      // Journalist editorial workflow: whenever an admin moves an
      // article out of PENDING_REVIEW (approving to PUBLISHED or
      // sending it back as REJECTED), record who reviewed it and when,
      // so the journalist dashboard can show who acted on it.
      if (
        existing.status === "PENDING_REVIEW" &&
        (data.status === "PUBLISHED" || data.status === "REJECTED")
      ) {
        data.reviewedAt = new Date();
        data.reviewedById = adminCheck.session.user.id;
      }
    }

    if (reviewNote !== undefined) {
      data.reviewNote =
        typeof reviewNote === "string" && reviewNote.trim() ? reviewNote.trim() : null;
    }

    if (authorId !== undefined) {
      data.authorId = authorId;
    }

    if (views !== undefined) {
      const numericViews = Number(views);

      if (!Number.isFinite(numericViews) || numericViews < 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Views must be a valid non-negative number",
          },
          { status: 400 }
        );
      }

      data.views = Math.floor(numericViews);
    }

    if (featured !== undefined) {
      data.featured = Boolean(featured);
    }

    if (nextPublishedAt !== undefined) {
      data.publishedAt = nextPublishedAt;
    }

    /*
     * Only one article should normally be featured.
     * When an article becomes featured, remove featured
     * status from all other articles.
     */
    if (data.featured === true) {
      await prisma.newsArticle.updateMany({
        where: {
          featured: true,
          NOT: {
            id,
          },
        },
        data: {
          featured: false,
        },
      });
    }

    const article = await prisma.newsArticle.update({
      where: {
        id,
      },
      data,
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

    // Only log actual editorial moderation decisions (status/featured
    // transitions), not routine copy edits (title/body/etc.), to keep
    // the audit log focused on the actions that matter for review.
    if (data.status !== undefined || data.featured !== undefined) {
      await logAdminAction({
        actor: adminCheck.session,
        action: "news_article.update_status",
        targetType: "NewsArticle",
        targetId: id,
        metadata: { status: data.status, featured: data.featured, reviewNote: data.reviewNote },
      });
    }

    return NextResponse.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error("PATCH /api/admin/news/[id] error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update news article",
      },
      { status: 500 }
    );
  }
}

// BUG FIX: the admin News editor's "Update Article" button sends
// PUT (see src/app/admin/news/page.tsx handleSubmit), but only PATCH
// was ever exported here — every edit was silently failing with a 405.
// PUT is aliased straight to the same handler as PATCH.
export { PATCH as PUT };

/**
 * DELETE /api/admin/news/[id]
 *
 * Delete a news article permanently.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Article ID is required",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.newsArticle.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "News article not found",
        },
        { status: 404 }
      );
    }

    await prisma.newsArticle.delete({
      where: {
        id,
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_article.delete",
      targetType: "NewsArticle",
      targetId: id,
    });

    return NextResponse.json({
      success: true,
      message: "News article deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /api/admin/news/[id] error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete news article",
      },
      { status: 500 }
    );
  }
}
