import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUploadThingFiles } from "@/lib/uploadthing";
import { rateLimit } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;

  const limit = await rateLimit(req, { limit: 10, window: 300, type: "messages-conversation-delete" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const otherUserId = params.userId;
  const currentUserId = session.user.id;

  try {
    const conversationFilter = {
      OR: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    };

    // Every image/voice-message/document attachment in the whole
    // conversation needs its UploadThing file cleaned up too - the
    // single-message DELETE route already does this per-message, but
    // this route was doing a bare deleteMany with no cleanup at all,
    // silently orphaning every attachment in the entire conversation
    // (the same class of leak already fixed once for post deletion).
    const messagesWithAttachments = await prisma.message.findMany({
      where: { ...conversationFilter, imageUrl: { not: null } },
      select: { imageUrl: true },
    });

    await prisma.message.deleteMany({ where: conversationFilter });

    await deleteUploadThingFiles(messagesWithAttachments.map((m) => m.imageUrl));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
