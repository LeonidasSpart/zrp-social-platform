import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";

// ─── POST (add a member by username) ────────────────────────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: "Only the list owner can add members" }, { status: 403 });
    }

    const body = await req.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!username) {
      return NextResponse.json({ error: "A username is required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Same rule as follow/notify-posts: a blocked-either-way pair must
    // not be able to curate one another into a (possibly public) list.
    if (targetUser.id !== session.user.id && (await isBlockedEitherWay(session.user.id, targetUser.id))) {
      return NextResponse.json({ error: "You can't add this user to a list" }, { status: 403 });
    }

    const memberCount = await prisma.listMember.count({ where: { listId: id } });
    if (memberCount >= 500) {
      return NextResponse.json({ error: "This list has reached its 500-member limit." }, { status: 400 });
    }

    const existing = await prisma.listMember.findUnique({
      where: { listId_userId: { listId: id, userId: targetUser.id } },
    });
    if (existing) {
      return NextResponse.json({ added: false, alreadyMember: true, user: targetUser });
    }

    await prisma.listMember.create({ data: { listId: id, userId: targetUser.id } });

    return NextResponse.json({ added: true, alreadyMember: false, user: targetUser }, { status: 201 });
  } catch (error) {
    console.error("Error adding list member:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
