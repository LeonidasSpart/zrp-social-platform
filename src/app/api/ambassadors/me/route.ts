import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/ambassadors/me
 *
 * The signed-in user's own ambassador application/profile, for the
 * dashboard foundation (/ambassadors/dashboard). Returns
 * { profile: null } - never a fabricated one - for a user who has
 * never applied, so the dashboard can render its empty "become an
 * ambassador" state honestly.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await prisma.ambassadorProfile.findUnique({
      where: { userId: session.user.id },
    });

    // Status changes the moment an admin approves/suspends - this must
    // never be served from a browser/proxy cache, or an approved
    // ambassador keeps seeing their old PENDING (or missing) state.
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/ambassadors/me error:", error);
    return NextResponse.json({ error: "Failed to load ambassador profile" }, { status: 500 });
  }
}
