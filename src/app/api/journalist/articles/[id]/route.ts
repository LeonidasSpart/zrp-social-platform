import { NextRequest, NextResponse } from "next/server";
import { NewsArticleCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireJournalistRole } from "@/lib/journalist";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/journalist/articles/[id]
 *
 * Fetch one of the signed-in journalist's own articles.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const check = await requireJournalistRole();
  if (!check.authorized) return check.response;

  const { id } = await context.params;

  const article = await prisma.newsArticle.findUnique({
    where: { id },
    include: { author: { select: AUTHOR_SELECT } },
  });

  if (!article || article.authorId !== check.session.user.id) {
    return NextResponse.json({ success: false, error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, article });
}

/**
 * PATCH /api/journalist/articles/[id]
 *
 * Edit one of the signed-in journalist's own articles. Only editable
 * while it is a DRAFT or was REJECTED (resubmission flow). Articles
 * that are PENDING_REVIEW, PUBLISHED, or ARCHIVED cannot be edited
 * through this route: those states are admin-managed.
 *
 * Body may include `submit: true` to move a DRAFT/REJECTED article to
 * PENDING_REVIEW (requires the journalist to be VERIFIED). authorId is
 * never accepted from the request body.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const check = await requireJournalistRole();
  if (!check.authorized) return check.response;

  if (check.journalistStatus === "SUSPENDED") {
    return NextResponse.json(
      { success: false, error: "Your journalist account is suspended." },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  const existing = await prisma.newsArticle.findUnique({ where: { id } });

  if (!existing || existing.authorId !== check.session.user.id) {
    return NextResponse.json({ success: false, error: "Article not found" }, { status: 404 });
  }

  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    return NextResponse.json(
      {
        success: false,
        error: "Only draft or rejected articles can be edited. This article is under review or published.",
      },
      { status: 409 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { title, slug, excerpt, content, coverImage, sourceName, sourceUrl, category, submit } =
      body;

    if (submit === true && check.journalistStatus !== "VERIFIED") {
      return NextResponse.json(
        { success: false, error: "Only verified journalists can submit articles for review." },
        { status: 403 }
      );
    }

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return NextResponse.json({ success: false, error: "Title cannot be empty" }, { status: 400 });
    }

    if (content !== undefined && (typeof content !== "string" || !content.trim())) {
      return NextResponse.json(
        { success: false, error: "Content cannot be empty" },
        { status: 400 }
      );
    }

    if (category !== undefined && !Object.values(NewsArticleCategory).includes(category)) {
      return NextResponse.json({ success: false, error: "Invalid news category" }, { status: 400 });
    }

    let cleanSlug = existing.slug;
    if (slug !== undefined) {
      if (typeof slug !== "string" || !slug.trim()) {
        return NextResponse.json({ success: false, error: "Slug cannot be empty" }, { status: 400 });
      }
      cleanSlug = slug.trim();

      if (cleanSlug !== existing.slug) {
        const slugOwner = await prisma.newsArticle.findFirst({
          where: { slug: cleanSlug, NOT: { id } },
          select: { id: true },
        });
        if (slugOwner) {
          return NextResponse.json(
            { success: false, error: "An article with this slug already exists" },
            { status: 409 }
          );
        }
      }
    }

    const article = await prisma.newsArticle.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        slug: cleanSlug,
        ...(excerpt !== undefined
          ? { excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null }
          : {}),
        ...(content !== undefined ? { content: content.trim() } : {}),
        ...(coverImage !== undefined
          ? { coverImage: typeof coverImage === "string" && coverImage.trim() ? coverImage.trim() : null }
          : {}),
        ...(sourceName !== undefined
          ? { sourceName: typeof sourceName === "string" && sourceName.trim() ? sourceName.trim() : null }
          : {}),
        ...(sourceUrl !== undefined
          ? { sourceUrl: typeof sourceUrl === "string" && sourceUrl.trim() ? sourceUrl.trim() : null }
          : {}),
        ...(category !== undefined ? { category: category as NewsArticleCategory } : {}),
        ...(submit === true
          ? {
              status: "PENDING_REVIEW" as const,
              submittedAt: new Date(),
              // Clear the previous reviewer's note now that a fresh
              // version has been submitted for a new look.
              reviewNote: null,
              reviewedAt: null,
              reviewedById: null,
            }
          : {}),
      },
      include: { author: { select: AUTHOR_SELECT } },
    });

    return NextResponse.json({ success: true, article });
  } catch (error) {
    console.error("PATCH /api/journalist/articles/[id] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update article" }, { status: 500 });
  }
}

/**
 * DELETE /api/journalist/articles/[id]
 *
 * Journalists may only delete their own DRAFT articles. Anything that
 * has ever been submitted (PENDING_REVIEW, REJECTED, PUBLISHED,
 * ARCHIVED) must stay for the editorial record: an admin can delete
 * it from /admin/news if truly necessary.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const check = await requireJournalistRole();
  if (!check.authorized) return check.response;

  const { id } = await context.params;

  const existing = await prisma.newsArticle.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true },
  });

  if (!existing || existing.authorId !== check.session.user.id) {
    return NextResponse.json({ success: false, error: "Article not found" }, { status: 404 });
  }

  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { success: false, error: "Only draft articles can be deleted." },
      { status: 409 }
    );
  }

  await prisma.newsArticle.delete({ where: { id } });

  return NextResponse.json({ success: true, message: "Draft deleted" });
}
