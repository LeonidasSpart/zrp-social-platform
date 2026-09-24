import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUploadsIfUnreferenced } from "@/lib/upload-ownership";

// ─── PUT: Edit a story's text content ──────────────────────────────────
// Text only, matching the same convention Post edit already uses (see
// iOS's EditPostSheet: "media is never touched by an edit on either
// client"). A Story's media is the core of the format and, unlike a
// post's image, has no separate removal/replace UI anywhere in the app -
// introducing one here would be new surface area, not a fix for the
// reported bug ("I posted a story without realizing my words were
// incomplete"), which is squarely about the text.
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    const trimmed = body.content.trim();

    const existingStory = await prisma.story.findUnique({
      where: { id: params.id },
      select: { userId: true, mediaUrl: true },
    });

    if (!existingStory) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (existingStory.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Same rule as creation (POST /api/stories): a story needs content
    // or media, never neither. A text-only story being edited down to
    // nothing would otherwise leave a blank, content-less story visible
    // to followers.
    if (!trimmed && !existingStory.mediaUrl) {
      return NextResponse.json(
        { error: "Please provide content or media" },
        { status: 400 }
      );
    }

    const updatedStory = await prisma.story.update({
      where: { id: params.id },
      data: { content: trimmed || null },
    });

    return NextResponse.json(updatedStory);
  } catch (error) {
    console.error("Error updating story:", error);
    return NextResponse.json({ error: "Failed to update story" }, { status: 500 });
  }
}

// ─── DELETE: Remove a story ─────────────────────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ⚠️ SECURITY: ownership is verified against the real DB row, never
    // trusted from the client - the frontend hiding the delete option on
    // someone else's story is a UX nicety, not the enforcement.
    const existingStory = await prisma.story.findUnique({
      where: { id: params.id },
      select: { userId: true, mediaUrl: true },
    });

    if (!existingStory) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (existingStory.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Explicit deletes for the two tables that reference this story
    // (mirrors the Post DELETE route's own convention, even though the
    // schema's onDelete: Cascade would also handle this at the DB
    // level). Message.storyId is onDelete: SetNull by design (see
    // Story's own KDoc in schema.prisma) - a story reply is a real DM
    // and must survive the story it was sent about disappearing, so it
    // is deliberately left untouched here.
    await prisma.$transaction([
      prisma.storyView.deleteMany({ where: { storyId: params.id } }),
      prisma.storyLike.deleteMany({ where: { storyId: params.id } }),
      prisma.story.delete({ where: { id: params.id } }),
    ]);

    // Best-effort UploadThing cleanup, same helper and ownership-by-key
    // guard every other delete route uses - never exposes a storage
    // path, and never deletes a file another row still references.
    await deleteUploadsIfUnreferenced([existingStory.mediaUrl]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting story:", error, {
      code: (error as any)?.code,
      meta: (error as any)?.meta,
    });
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
}
