import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CURRENT_CODE_OF_CONDUCT_VERSION } from "@/lib/ambassadors/codeOfConduct";

/**
 * POST /api/ambassadors/accept-code
 *
 * Re-acceptance of the Ambassador Code of Conduct for an existing
 * applicant/Ambassador, used when CURRENT_CODE_OF_CONDUCT_VERSION has
 * moved on since they last accepted (see the dashboard's
 * "codeUpdated" banner). The version and timestamp are always the
 * server's own current value and the current time - the client sends
 * no data here, so there is nothing for it to forge.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.ambassadorProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "No ambassador application found" }, { status: 404 });
    }

    const profile = await prisma.ambassadorProfile.update({
      where: { userId: session.user.id },
      data: {
        codeOfConductVersion: CURRENT_CODE_OF_CONDUCT_VERSION,
        codeOfConductAcceptedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("POST /api/ambassadors/accept-code error:", error);
    return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 });
  }
}
