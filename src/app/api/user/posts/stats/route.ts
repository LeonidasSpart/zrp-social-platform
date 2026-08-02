import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const posts = await prisma.post.findMany({
      where: { authorId: session.user.id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        views: true,
        _count: {
          select: { likes: true, comments: true, reposts: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const totalStats = posts.reduce(
      (acc, p) => ({
        totalViews: acc.totalViews + p.views,
        totalLikes: acc.totalLikes + p._count.likes,
        totalComments: acc.totalComments + p._count.comments,
        totalReposts: acc.totalReposts + p._count.reposts,
      }),
      { totalViews: 0, totalLikes: 0, totalComments: 0, totalReposts: 0 }
    );

    return NextResponse.json({ posts, totalStats });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
