import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Account deletion is the same UploadThing-orphan gap as individual
    // post/message/comment deletion, just at full-account scale - every
    // post, message, comment, and story this user ever had cascades away
    // in the database (onDelete: Cascade throughout), but none of that
    // ever reaches UploadThing. Collecting every file this user actually
    // owns before the cascade wipes the rows that reference them. Only
    // messages they *sent* are included - an image in a received message
    // was uploaded by the other person, not this account, and stays theirs.
    const [posts, comments, messages, stories] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id },
        select: { imageUrl: true, imageUrls: true },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.message.findMany({
        where: { senderId: user.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.story.findMany({
        where: { userId: user.id, mediaUrl: { not: null } },
        select: { mediaUrl: true },
      }),
    ]);

    await prisma.user.delete({
      where: { id: session.user.id },
    });

    await deleteUploadThingFiles([
      user.avatarUrl,
      user.coverUrl,
      ...posts.flatMap((p) => [p.imageUrl, ...p.imageUrls]),
      ...comments.map((c) => c.imageUrl),
      ...messages.map((m) => m.imageUrl),
      ...stories.map((s) => s.mediaUrl),
    ]);

    const response = NextResponse.json({ success: true });
    // Clear both possible cookie names (http and https/production variants)
    response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" });
    response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/", secure: true });

    return response;
  } catch (error) {
    console.error("Confirm deletion error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
