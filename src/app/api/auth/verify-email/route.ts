import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  console.log(`🔍 Verification attempt with token: ${token}`);

  if (!token) {
    console.log("❌ Missing token");
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    // Find user with this token (ignore expiry for logging)
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
      },
    });

    if (!user) {
      console.log(`❌ No user found with token: ${token}`);
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    console.log(`✅ User found: ${user.id} (${user.email})`);
    console.log(`   Token stored: ${user.verificationToken}`);
    console.log(`   Expiry: ${user.verificationTokenExpiry}`);
    console.log(`   Pending email: ${user.pendingEmail}`);

    // Check expiry
    if (!user.verificationTokenExpiry) {
      console.log("⏰ Token has no expiry");
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (user.verificationTokenExpiry < new Date()) {
      console.log(`⏰ Token expired at ${user.verificationTokenExpiry}`);
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (!user.pendingEmail) {
      console.log("⚠️ No pending email for user");
      return NextResponse.json({ error: "No pending email change" }, { status: 400 });
    }

    // Update email
    const newEmail = user.pendingEmail;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        pendingEmail: null,
        verificationToken: null,
        verificationTokenExpiry: null,
        emailVerified: new Date(),
      },
    });

    console.log(`✅ Email changed to ${newEmail} for user ${user.id}`);

    const redirectUrl = new URL("/settings", process.env.NEXTAUTH_URL);
    redirectUrl.searchParams.set("emailUpdated", "true");
    console.log(`↩️ Redirecting to: ${redirectUrl.toString()}`);
    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("❌ Verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
