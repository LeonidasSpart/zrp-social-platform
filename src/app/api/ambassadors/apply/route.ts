import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { validateApplication } from "@/lib/ambassadors/validation";

/**
 * POST /api/ambassadors/apply
 *
 * Lets a signed-in user apply to become a ZRP Global Ambassador.
 *
 * This only ever creates a PENDING application. Nothing here grants
 * ambassador status, a badge, or any privilege - approval happens
 * exclusively through /api/admin/ambassadors/[id] (see that route),
 * mirroring how /api/journalist/apply already works. A user is never
 * told they are an official ambassador before an admin approves them.
 *
 * A previously REJECTED applicant may re-apply. A PENDING, APPROVED,
 * or SUSPENDED applicant cannot submit a new application.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { limit: 5, window: 3600, type: "ambassador-apply" });
  if (!limited.success) return limited.response!;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const result = validateApplication(body);
    if (!result.ok || !result.value) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const existing = await prisma.ambassadorProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (existing && existing.status !== "REJECTED") {
      const messages: Record<string, string> = {
        PENDING: "Your ambassador application is already pending review.",
        APPROVED: "You are already a ZRP Ambassador.",
        SUSPENDED: "Your ambassador status is suspended. Contact an admin.",
      };
      return NextResponse.json(
        { success: false, error: messages[existing.status] || "Application already exists." },
        { status: 409 }
      );
    }

    const data = {
      countryCode: result.value.countryCode,
      cityRegion: result.value.cityRegion,
      languages: result.value.languages,
      communityLinks: result.value.communityLinks,
      motivation: result.value.motivation,
      communityDescription: result.value.communityDescription,
      audienceSize: result.value.audienceSize,
    };

    const profile = existing
      ? await prisma.ambassadorProfile.update({
          where: { userId: session.user.id },
          data: {
            ...data,
            status: "PENDING",
            appliedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            rejectionReason: null,
          },
        })
      : await prisma.ambassadorProfile.create({
          data: { userId: session.user.id, ...data },
        });

    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ambassadors/apply error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit ambassador application" },
      { status: 500 }
    );
  }
}
