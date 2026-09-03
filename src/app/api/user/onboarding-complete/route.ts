import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findExistingSessionUser, ACCOUNT_NOT_FOUND_RESPONSE } from "@/lib/session-user";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same defensive check as PUT /api/user/profile: a JWT session is a
  // self-contained signed token, not a live server-side record, so it
  // can still look "authenticated" after the User row it points to is
  // gone (deleted account, stale cookie). Without this, that case fell
  // through to Prisma's update-on-missing-row error below and surfaced
  // as a generic 500 instead of a state the client can actually recover
  // from.
  const existingUser = await findExistingSessionUser(session.user.id);
  if (!existingUser) {
    return NextResponse.json(ACCOUNT_NOT_FOUND_RESPONSE, { status: 401 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingCompleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Onboarding complete error:", error);
    return NextResponse.json({ error: "Failed to complete onboarding" }, { status: 500 });
  }
}
