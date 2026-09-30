import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { invalidateUserAuthState } from "@/lib/auth-state";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ⚠️ SECURITY: every other password-adjacent endpoint in the app is
  // rate-limited (login, reset-password, forgot-password); this one
  // wasn't, letting a session holder (stolen cookie, shared device)
  // brute-force currentPassword via bcrypt.compare with no lockout.
  const limit = await rateLimitByIpAndUser(req, session.user.id, {
    limit: 10,
    window: 900,
    type: "user-password-change",
  });
  if (!limit.success) return limit.response;

  try {
    const { currentPassword, newPassword } = await req.json();

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Accounts with no password yet (e.g. Google sign-in) ────────
    // Let them set an initial password without requiring a "current" one.
    if (!user.password) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: session.user.id },
        // ⚠️ SECURITY: credentialsVersion is bumped on every credential
        // change - src/lib/auth-state.ts's applyAuthStateToToken()
        // treats a token minted under an older version exactly like a
        // banned session, forcing sign-out on every OTHER device/tab
        // holding a session for this account. Without this, changing a
        // password never invalidated any already-issued session/token,
        // so a stolen cookie or leaked native sessionToken stayed valid
        // for up to 30 days after the account was "secured."
        data: { password: hashedPassword, credentialsVersion: { increment: 1 } },
      });
      invalidateUserAuthState(session.user.id);
      return NextResponse.json({ message: "Password set successfully" });
    }

    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashedPassword, credentialsVersion: { increment: 1 } },
    });
    invalidateUserAuthState(session.user.id);

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password update error:", error);
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
