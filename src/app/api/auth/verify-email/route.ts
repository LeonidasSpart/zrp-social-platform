import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (!user.pendingEmail) {
    return NextResponse.json({ error: "No pending email change" }, { status: 400 });
  }

  // Update email and clear pending fields
  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: user.pendingEmail,
      pendingEmail: null,
      verificationToken: null,
      verificationTokenExpiry: null,
      emailVerified: new Date(),
    },
  });

  // Redirect to a success page or show message
  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?emailUpdated=true`);
}
