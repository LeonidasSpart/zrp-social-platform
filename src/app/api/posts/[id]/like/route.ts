import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;

  try {
    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: session.user.id,
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: {
          postId_userId: {
            postId,
            userId: session.user.id,
          },
        },
      });
      return NextResponse.json({ liked: false });
    } else {
      await prisma.like.create({
        data: {
          postId,
          userId: session.user.id,
        },
      });
      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
