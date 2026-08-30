import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { canManageTeam } from "@/lib/permissions";
import { sendTeamInvitation } from "@/lib/email";

// ─── GET: List team members ────────────────────────────────────────
export async function GET(req: NextRequest) {
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

    // Get all team members for this account (accountId = userId)
    const members = await prisma.teamMember.findMany({
      where: { accountId: userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            avatarUrl: true,
            plan: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Add the owner (the account holder) as an implicit ADMIN
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        avatarUrl: true,
        plan: true,
      },
    });

    return NextResponse.json({
      members,
      owner: {
        ...owner,
        role: "OWNER",
      },
    });
  } catch (error) {
    console.error("Team GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST: Add a team member ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    // Check permission: include name for the owner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, id: true, email: true, name: true }, // ✅ added name
    });
    if (!user || !canManageTeam(user)) {
      return NextResponse.json(
        { error: "Team management requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, role = "VIEWER" } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    // Validate role
    if (!["ADMIN", "EDITOR", "VIEWER"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN, EDITOR, or VIEWER." },
        { status: 400 }
      );
    }

    // Find the invited user
    const invitedUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, plan: true },
    });

    if (!invitedUser) {
      return NextResponse.json(
        { error: "User with this email does not exist. They need to sign up first." },
        { status: 404 }
      );
    }

    // Check if already a member of this team
    const existing = await prisma.teamMember.findUnique({
      where: {
        accountId_userId: {
          accountId: userId,
          userId: invitedUser.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this team." },
        { status: 409 }
      );
    }

    // Prevent adding yourself
    if (invitedUser.id === userId) {
      return NextResponse.json(
        { error: "You are the owner of this team and cannot be added as a member." },
        { status: 400 }
      );
    }

    // Create team member
    const member = await prisma.teamMember.create({
      data: {
        accountId: userId,
        userId: invitedUser.id,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            avatarUrl: true,
            plan: true,
          },
        },
      },
    });

    // Send invitation email
    try {
      await sendTeamInvitation({
        to: invitedUser.email,
        accountOwnerName: user.name || user.email, // ✅ now user.name exists
        role,
        teamLink: `${process.env.NEXTAUTH_URL}/settings/team`, // corrected path
      });
    } catch (emailError) {
      console.warn("Failed to send invitation email:", emailError);
      // Don't fail the request, just log
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Team POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
