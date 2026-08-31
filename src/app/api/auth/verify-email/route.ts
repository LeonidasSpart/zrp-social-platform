import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { rateLimit } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  // Prevent brute-forcing the verification token by request volume.
  const limit = await rateLimit(req, {
    limit: 20,
    window: 600,
    type: "auth-verify-email",
  });
  if (!limit.success) return limit.response;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Missing token" },
      { status: 400 }
    );
  }
  try {
    const hashedToken = hashToken(token);
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashedToken,
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }
    if (
      !user.verificationTokenExpiry ||
      user.verificationTokenExpiry < new Date()
    ) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }
    /*
     * There are two verification flows:
     *
     * 1. Normal registration:
     *    The user's existing email must simply be verified.
     *
     * 2. Email change:
     *    pendingEmail contains the new email and must replace
     *    the current email.
     *
     * The old code required pendingEmail to exist, which caused
     * normal account registration verification links to fail.
     */
    const updateData = user.pendingEmail
      ? {
          // Email-change verification
          email: user.pendingEmail,
          pendingEmail: null,
          verificationToken: null,
          verificationTokenExpiry: null,
          emailVerified: new Date(),
        }
      : {
          // Normal registration verification
          verificationToken: null,
          verificationTokenExpiry: null,
          emailVerified: new Date(),
        };
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
    /*
     * After successful verification, send the user to login.
     * NEXTAUTH_URL should normally be https://zrp.one in production.
     */
    const redirectUrl = new URL(
      "/login",
      process.env.NEXTAUTH_URL || "https://zrp.one"
    );
    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
