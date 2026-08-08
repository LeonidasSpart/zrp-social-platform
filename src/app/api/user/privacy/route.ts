import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { publicLikes, publicFollowing, isPrivate } = body; // ✅ include isPrivate

  // Update only the fields that are provided
  const data: any = {};
  if (publicLikes !== undefined) data.publicLikes = publicLikes;
  if (publicFollowing !== undefined) data.publicFollowing = publicFollowing;
  if (isPrivate !== undefined) data.isPrivate = isPrivate; // ✅ added

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      publicLikes: true,
      publicFollowing: true,
      isPrivate: true, // ✅ include in response
    },
  });

  return NextResponse.json({
    publicLikes: user.publicLikes,
    publicFollowing: user.publicFollowing,
    isPrivate: user.isPrivate, // ✅ return it
  });
}
