import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Fetch all comments for this post
    const comments = await prisma.comment.findMany({
      where: { postId: params.postId },
      orderBy: { createdAt: "asc" },
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
        replies: {
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
        },
      },
    });

    // Build a tree: top-level comments (no parent) with their replies
    const commentMap = new Map();
    const topLevelComments: any[] = [];

    comments.forEach((comment) => {
      const commentWithReplies = { ...comment, replies: [] };
      commentMap.set(comment.id, commentWithReplies);
    });

    comments.forEach((comment) => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(commentMap.get(comment.id));
        }
      } else {
        topLevelComments.push(commentMap.get(comment.id));
      }
    });

    // Sort top-level comments by createdAt (newest first)
    topLevelComments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Sort replies by createdAt (oldest first – threaded view)
    topLevelComments.forEach((comment) => {
      comment.replies.sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    return NextResponse.json(topLevelComments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, parentId } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // If parentId is provided, verify the parent comment exists
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
      if (parent.postId !== params.postId) {
        return NextResponse.json({ error: "Parent comment does not belong to this post" }, { status: 400 });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId: params.postId,
        authorId: session.user.id,
        parentId: parentId || null,
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

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
