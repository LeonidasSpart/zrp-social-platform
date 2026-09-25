import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { publicLikes, publicFollowing, isPrivate } = body; // ✅ include isPrivate

  // Non-boolean values used to reach prisma.update unchecked and surface
  // as an unhandled 500 (Prisma validation error).
  for (const value of [publicLikes, publicFollowing, isPrivate]) {
    if (value !== undefined && typeof value !== "boolean") {
      return NextResponse.json({ error: "Privacy settings must be true or false" }, { status: 400 });
    }
  }

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
