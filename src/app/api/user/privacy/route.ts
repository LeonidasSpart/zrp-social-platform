import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { publicLikes, publicFollowing } = await req.json();

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      publicLikes: publicLikes !== undefined ? publicLikes : undefined,
      publicFollowing: publicFollowing !== undefined ? publicFollowing : undefined,
    },
  });

  return NextResponse.json({
    publicLikes: user.publicLikes,
    publicFollowing: user.publicFollowing,
  });
}
