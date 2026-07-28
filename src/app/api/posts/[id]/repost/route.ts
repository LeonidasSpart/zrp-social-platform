import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    // Check if already reposted
    const existing = await prisma.repost.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existing) {
      // Unrepost
      await prisma.repost.delete({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });
      return NextResponse.json({ reposted: false });
    } else {
      // Repost
      await prisma.repost.create({
        data: {
          postId,
          userId,
        },
      });
      return NextResponse.json({ reposted: true });
    }
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
