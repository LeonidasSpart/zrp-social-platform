import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkPostLength } from "@/lib/limits";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

// GET a single post (with all data for the post page)
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);

    const post = await prisma.post.findUnique({
      where: { id: params.id },
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
        poll: {
          include: {
            votes_user: {
              where: session ? { userId: session.user.id } : undefined,
              select: { optionIndex: true },
            },
          },
        },
        // ✅ QUOTE REPOST – include the quoted post
        quotePost: {
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
            _count: {
              select: {
                likes: true,
                comments: true,
                reposts: true,
                quotedBy: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
            quotedBy: true,
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Add liked status if user is logged in
    if (session?.user?.id) {
      const like = await prisma.like.findUnique({
        where: {
          postId_userId: {
            postId: params.id,
            userId: session.user.id,
          },
        },
      });
      (post as any).liked = !!like;
    }

    // Transform poll data
    const result = { ...post };
    if (post.poll) {
      const poll = post.poll as any;
      poll.userVote = poll.votes_user?.[0]?.optionIndex ?? null;
      delete poll.votes_user;
      result.poll = poll;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching post:", error);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

// UPDATE a post
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { content } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Check if post exists and belongs to user
    const existingPost = await prisma.post.findUnique({
      where: { id: params.id },
      select: { authorId: true, author: { select: { plan: true } } },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (existingPost.authorId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Validate against the author's actual plan limit, same as post
    // creation - this previously had no server-side length check at all,
    // meaning it silently trusted whatever the client sent.
    const lengthCheck = checkPostLength(content.length, existingPost.author.plan);
    if (!lengthCheck.allowed) {
      return NextResponse.json({ error: lengthCheck.message }, { status: 400 });
    }

    // ─── Build the update payload ──────────────────────────────────
    // Only touch imageUrl if the request actually included it. The
    // main edit UI (EditPostModal) is text-only and never sends
    // imageUrl at all - previously this defaulted the missing field
    // to null unconditionally, silently deleting the post's image on
    // every text-only edit. Checking "in body" lets a real image
    // change (or an explicit removal, sending imageUrl: null) still
    // work correctly, while a text-only edit leaves the image alone.
    const updateData: { content: string; imageUrl?: string | null } = { content };
    if ("imageUrl" in body) {
      updateData.imageUrl = body.imageUrl || null;
    }

    const updatedPost = await prisma.post.update({
      where: { id: params.id },
      data: updateData,
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
        // ✅ also include quotePost in the updated response
        quotePost: {
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
            _count: {
              select: {
                likes: true,
                comments: true,
                reposts: true,
                quotedBy: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
            quotedBy: true,
          },
        },
      },
    });

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE a post
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if post exists and belongs to user
    const existingPost = await prisma.post.findUnique({
      where: { id: params.id },
      select: { authorId: true, imageUrl: true, imageUrls: true },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (existingPost.authorId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // The comments on this post are about to be cascade-deleted below too -
    // any images they had would be orphaned the same way the post's own
    // image would be, so their URLs need collecting before that happens.
    const commentsWithImages = await prisma.comment.findMany({
      where: { postId: params.id, imageUrl: { not: null } },
      select: { imageUrl: true },
    });

    // Delete all related records first (cascade should handle this, but we do it explicitly)
    await prisma.$transaction([
      prisma.like.deleteMany({ where: { postId: params.id } }),
      prisma.comment.deleteMany({ where: { postId: params.id } }),
      prisma.repost.deleteMany({ where: { postId: params.id } }),
      // ✅ For quote reposts: when a post is deleted, its quotePostId will be set to null automatically
      // because we used onDelete: SetNull in the schema. No extra action needed.
      prisma.post.delete({ where: { id: params.id } }),
    ]);

    // Best-effort UploadThing cleanup - runs after the DB delete succeeds,
    // and never blocks or fails the request if it has trouble (see
    // deleteUploadThingFiles for why).
    await deleteUploadThingFiles([
      existingPost.imageUrl,
      ...existingPost.imageUrls,
      ...commentsWithImages.map((c) => c.imageUrl),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
