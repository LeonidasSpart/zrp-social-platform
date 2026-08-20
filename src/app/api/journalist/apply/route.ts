import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/journalist/apply
 *
 * Lets a signed-in user apply to become a ZRP Journalist.
 *
 * Applying grants the JOURNALIST role immediately, but the applicant
 * is NOT verified and receives no badge until an admin approves the
 * application (see /api/admin/journalists/[id]).
 *
 * A previously REJECTED applicant may re-apply. A PENDING, VERIFIED,
 * or SUSPENDED applicant cannot submit a new application.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const outlet = typeof body.outlet === "string" ? body.outlet.trim().slice(0, 200) : null;
    const pitch = typeof body.pitch === "string" ? body.pitch.trim().slice(0, 5000) : null;
    const portfolioUrl =
      typeof body.portfolioUrl === "string" ? body.portfolioUrl.trim().slice(0, 500) : null;

    if (!pitch) {
      return NextResponse.json(
        { success: false, error: "Tell us why you'd like to become a ZRP Journalist." },
        { status: 400 }
      );
    }

    const existing = await prisma.journalistProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (existing && existing.status !== "REJECTED") {
      const messages: Record<string, string> = {
        PENDING: "Your journalist application is already pending review.",
        VERIFIED: "You are already a verified ZRP Journalist.",
        SUSPENDED: "Your journalist account is suspended. Contact an admin.",
      };

      return NextResponse.json(
        { success: false, error: messages[existing.status] || "Application already exists." },
        { status: 409 }
      );
    }

    const profile = await prisma.$transaction(async (tx) => {
      const updatedProfile = existing
        ? await tx.journalistProfile.update({
            where: { userId: session.user.id },
            data: {
              status: "PENDING",
              outlet,
              pitch,
              portfolioUrl,
              appliedAt: new Date(),
              reviewedAt: null,
              reviewedById: null,
              rejectionReason: null,
            },
          })
        : await tx.journalistProfile.create({
            data: {
              userId: session.user.id,
              status: "PENDING",
              outlet,
              pitch,
              portfolioUrl,
            },
          });

      await tx.user.update({
        where: { id: session.user.id },
        data: { role: "JOURNALIST" },
      });

      return updatedProfile;
    });

    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (error) {
    console.error("POST /api/journalist/apply error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit journalist application" },
      { status: 500 }
    );
  }
}
