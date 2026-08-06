import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    let profile = await prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            plan: true,
          },
        },
      },
    });

    // Create profile if doesn't exist (requires Business/Enterprise plan)
    if (!profile) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      });

      // Only Business/Enterprise can enable creator monetisation
      if (!user || !["business", "enterprise"].includes(user.plan)) {
        return NextResponse.json({
          profile: null,
          isEligible: false,
          message: "Creator monetisation requires Business or Enterprise plan.",
        });
      }

      profile = await prisma.creatorProfile.create({
        data: { userId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
              plan: true,
            },
          },
        },
      });
    }

    return NextResponse.json({
      profile,
      isEligible: true,
    });
  } catch (error) {
    console.error("Creator profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json();
    const { tipsEnabled, tipsMessage, premiumPostsEnabled } = body;

    const profile = await prisma.creatorProfile.update({
      where: { userId },
      data: {
        tipsEnabled: tipsEnabled !== undefined ? tipsEnabled : undefined,
        tipsMessage: tipsMessage !== undefined ? tipsMessage : undefined,
        premiumPostsEnabled: premiumPostsEnabled !== undefined ? premiumPostsEnabled : undefined,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Update creator profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
