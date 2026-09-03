import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findExistingSessionUser, ACCOUNT_NOT_FOUND_RESPONSE } from "@/lib/session-user";

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify that the session user still exists.
    const existingUser = await findExistingSessionUser(session.user.id);

    if (!existingUser) {
      return NextResponse.json(ACCOUNT_NOT_FOUND_RESPONSE, { status: 401 });
    }

    const { name, bio, location, website } = await req.json();

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name:
          typeof name === "string" && name.trim()
            ? name.trim()
            : null,
        bio:
          typeof bio === "string" && bio.trim()
            ? bio.trim()
            : null,
        location:
          typeof location === "string" && location.trim()
            ? location.trim()
            : null,
        website:
          typeof website === "string" && website.trim()
            ? website.trim()
            : null,
      },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        location: true,
        website: true,
        badgeType: true,
        createdAt: true,
        onboardingCompleted: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
