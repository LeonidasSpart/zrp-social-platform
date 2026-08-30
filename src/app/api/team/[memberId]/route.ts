import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { canManageTeam, isTeamAdmin } from "@/lib/permissions";

// ─── PATCH: Update member role ────────────────────────────────────
export async function PATCH(req: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    // Check if user can manage team (Business/Enterprise)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, id: true },
    });
    if (!user || !canManageTeam(user)) {
      return NextResponse.json(
        { error: "Team management requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    const { memberId } = params;

    // Get the member to update
    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Team member not found." },
        { status: 404 }
      );
    }

    // Ensure this member belongs to this account
    if (member.accountId !== userId) {
      return NextResponse.json(
        { error: "You can only manage your own team members." },
        { status: 403 }
      );
    }

    // Owner cannot be modified (they are not in the TeamMember table anyway)
    // But we check if the member is the owner (accountId === userId): impossible because owner is not in table.

    const body = await req.json();
    const { role } = body;

    if (!role || !["ADMIN", "EDITOR", "VIEWER"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN, EDITOR, or VIEWER." },
        { status: 400 }
      );
    }

    // Additional permission: only owner or existing admins can change role
    // We'll check if current user is owner (userId === accountId) or is an admin of this team.
    const isAdmin = await prisma.teamMember.findUnique({
      where: {
        accountId_userId: {
          accountId: userId,
          userId: userId,
        },
      },
    });

    // If not owner and not admin, deny
    if (userId !== member.accountId && !isAdmin) {
      return NextResponse.json(
        { error: "Only the team owner or admins can change roles." },
        { status: 403 }
      );
    }

    // Prevent lowering your own role if you're the only admin (optional)
    // We'll skip for simplicity.

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error("Team PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove a team member ────────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, id: true },
    });
    if (!user || !canManageTeam(user)) {
      return NextResponse.json(
        { error: "Team management requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    const { memberId } = params;

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Team member not found." },
        { status: 404 }
      );
    }

    // Must belong to this account
    if (member.accountId !== userId) {
      return NextResponse.json(
        { error: "You can only remove your own team members." },
        { status: 403 }
      );
    }

    // Only owner or admins can remove
    const isAdmin = await prisma.teamMember.findUnique({
      where: {
        accountId_userId: {
          accountId: userId,
          userId: userId,
        },
      },
    });

    if (userId !== member.accountId && !isAdmin) {
      return NextResponse.json(
        { error: "Only the team owner or admins can remove members." },
        { status: 403 }
      );
    }

    await prisma.teamMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
