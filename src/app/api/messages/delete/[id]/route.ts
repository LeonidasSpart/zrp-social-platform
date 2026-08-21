import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUploadThingFiles } from "@/lib/uploadthing";
import { rateLimit } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  const limit = await rateLimit(req, { limit: 30, window: 300, type: "messages-delete" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = params.id;

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, receiverId: true, imageUrl: true },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.senderId !== session.user.id && message.receiverId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // imageUrl doubles as the attachment field for images, documents, and
    // voice messages alike (Message has no separate fields per type), so
    // this one call covers all three attachment kinds a DM can carry.
    await deleteUploadThingFiles([message.imageUrl]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
