import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Get all comments by this user ──────────────────────────────
    const replies = await prisma.comment.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
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
        post: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                username: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // ─── Format replies with replyTo context ────────────────────────
    const formattedReplies = replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      imageUrl: null, // comments don't have images yet
      createdAt: reply.createdAt,
      author: reply.author,
      replyTo: {
        id: reply.post.id,
        content: reply.post.content,
        author: {
          username: reply.post.author.username,
          name: reply.post.author.name,
        },
      },
    }));

    return NextResponse.json(formattedReplies);
  } catch (error) {
    console.error("Error fetching replies:", error);
    return NextResponse.json({ error: "Failed to fetch replies" }, { status: 500 });
  }
}
