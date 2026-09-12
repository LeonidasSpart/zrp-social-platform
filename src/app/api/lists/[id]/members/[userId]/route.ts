import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId: targetUserId } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const list = await prisma.list.findUnique({ where: { id }, select: { ownerId: true } });
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (list.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Only the list owner can remove members" }, { status: 403 });
    }

    await prisma.listMember.deleteMany({ where: { listId: id, userId: targetUserId } });
    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Error removing list member:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
