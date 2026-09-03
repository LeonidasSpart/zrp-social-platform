import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { hashToken } from "@/lib/tokens";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newEmail: rawNewEmail } = await req.json();

  if (!currentPassword || !rawNewEmail) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Same normalization as registration/login (see register/route.ts) -
  // every other entry point that writes or looks up User.email
  // lowercases first, so this one must too or the account could end
  // up unable to log in with its own new email.
  const newEmail = String(rawNewEmail).trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Check if the new email is already taken
  const existingUser = await prisma.user.findUnique({
    where: { email: newEmail },
  });
  if (existingUser) {
    return NextResponse.json({ error: "Email already in use" }, { status: 400 });
  }

  // Verify current password
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });
  if (!user || !user.password) {
    return NextResponse.json(
      { error: "This account doesn't have a password set. Please use your sign-in provider to manage your account." },
      { status: 400 }
    );
  }

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  // Generate verification token
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Save pending email and token
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      pendingEmail: newEmail,
      verificationToken: hashToken(token),
      verificationTokenExpiry: expiry,
    },
  });

  // Construct the full verification URL. Same fallback as
  // sendVerificationEmail's own default link and /api/auth/verify's
  // redirect - without it, a missing NEXTAUTH_URL would produce a
  // literal "undefined/api/auth/verify-email?..." link, and unlike
  // the default registration link this one is passed in as an
  // explicit override, so sendVerificationEmail's own fallback never
  // gets a chance to catch it.
  const baseUrl = (process.env.NEXTAUTH_URL || "https://zrp.one").replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  // Send the email
  await sendVerificationEmail(newEmail, token, verifyUrl);

  return NextResponse.json({ message: "Verification email sent. Please check your inbox." });
}
