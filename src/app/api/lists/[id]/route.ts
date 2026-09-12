import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function loadListForViewer(id: string, userId: string | null | undefined) {
  const list = await prisma.list.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      isPrivate: true,
      ownerId: true,
      createdAt: true,
      owner: { select: { id: true, username: true, name: true, avatarUrl: true } },
      members: {
        orderBy: { addedAt: "desc" },
        select: {
          addedAt: true,
          user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
        },
      },
    },
  });
  if (!list) return { list: null, isOwner: false, visible: false };

  const isOwner = userId === list.ownerId;
  const visible = isOwner || !list.isPrivate;
  return { list, isOwner, visible };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  try {
    const { list, isOwner, visible } = await loadListForViewer(id, userId);
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (!visible) {
      return NextResponse.json({ error: "This list is private" }, { status: 403 });
    }

    return NextResponse.json({
      list: { ...list, memberCount: list.members.length },
      isOwner,
    });
  } catch (error) {
    console.error("Error fetching list:", error);
    return NextResponse.json({ error: "Failed to fetch list" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
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
      return NextResponse.json({ error: "Only the list owner can edit it" }, { status: 403 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 60) {
        return NextResponse.json({ error: "List name must be 1-60 characters." }, { status: 400 });
      }
      data.name = name;
    }
    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description ? body.description.trim().slice(0, 200) : null;
    }
    if (typeof body.isPrivate === "boolean") {
      data.isPrivate = body.isPrivate;
    }

    const updated = await prisma.list.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true, isPrivate: true },
    });

    return NextResponse.json({ list: updated });
  } catch (error) {
    console.error("Error updating list:", error);
    return NextResponse.json({ error: "Failed to update list" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
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
      return NextResponse.json({ error: "Only the list owner can delete it" }, { status: 403 });
    }

    await prisma.list.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting list:", error);
    return NextResponse.json({ error: "Failed to delete list" }, { status: 500 });
  }
}
