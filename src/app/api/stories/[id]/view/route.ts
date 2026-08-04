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

  const storyId = params.id;
  const viewerId = session.user.id;

  // Upsert view (avoid duplicate)
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
