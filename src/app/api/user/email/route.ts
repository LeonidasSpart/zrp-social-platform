import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newEmail } = await req.json();

  if (!currentPassword || !newEmail) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Validate email format (basic)
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
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  // Generate verification token
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store the new email temporarily with token
  // We'll store it in the user record (but not verified yet)
  // We'll use a separate field or reuse the existing verificationToken
  // We'll store the pending email in a new field? Or we can update email directly after verification.
  // Better: we store the pending email in a separate field (pendingEmail) and use verificationToken for confirmation.
  // Since we don't have pendingEmail in schema, we can either add it or use a two-step: send token, then on verification update email.
  // We'll add a pendingEmail field to the User model.

  // Instead of modifying schema, we can store the new email in the verification token itself (e.g., as metadata).
  // Or we can store it in a separate table. For simplicity, we'll add a `pendingEmail` field to User.
  // Let's assume we add it.
  // For now, I'll show the code with the assumption we have `pendingEmail` and `verificationToken` fields.

  // Update user with pending email and token
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      pendingEmail: newEmail,
      verificationToken: token,
      verificationTokenExpiry: expiry,
    },
  });

  // Send verification email
  const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email?token=${token}`;
  await sendVerificationEmail(newEmail, verifyUrl);

  return NextResponse.json({ message: "Verification email sent. Please check your inbox." });
}
