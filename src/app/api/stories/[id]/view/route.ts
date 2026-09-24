import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storyId = params.id;
  const viewerId = session.user.id;

  // The story may have expired/been deleted between the viewer opening
  // it and this request landing (e.g. the owner deleted it from another
  // device mid-view) - without this check, the upsert below throws an
  // unhandled foreign-key violation instead of a clean 404.
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true },
  });
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  // Prevent duplicate views
  await prisma.storyView.upsert({
    where: {
      storyId_viewerId: {
        storyId,
        viewerId,
      },
    },
    update: {},
    create: {
      storyId,
      viewerId,
    },
  });

  return NextResponse.json({ success: true });
}
