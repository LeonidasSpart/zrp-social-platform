import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = params.id;
  const userId = session.user.id;

  const existing = await prisma.commentRepost.findUnique({
    where: {
      commentId_userId: {
        commentId,
        userId,
      },
    },
  });

  if (existing) {
    await prisma.commentRepost.delete({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });
    return NextResponse.json({ reposted: false });
  } else {
    await prisma.commentRepost.create({
      data: {
        commentId,
        userId,
      },
    });
    return NextResponse.json({ reposted: true });
  }
}
