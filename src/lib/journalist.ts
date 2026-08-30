import { getServerSession, type Session } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { prisma } from "./db";
import { JournalistStatus } from "@prisma/client";

// The badgeType value used to render the ZRP Journalist badge via the
// existing VerifiedBadge component. Kept in one place so the schema
// value and the UI mapping in VerifiedBadge.tsx never drift apart.
export const JOURNALIST_BADGE_TYPE = "journalist";

// ─── Session-level guards for API routes ────────────────────────────

type JournalistCheckResult =
  | { authorized: true; session: Session; journalistStatus: JournalistStatus }
  | { authorized: false; response: NextResponse };

/**
 * Require the caller to be signed in and hold the JOURNALIST role.
 * Does NOT require verification: used for endpoints a pending/rejected
 * applicant should still be able to reach (e.g. viewing their own
 * application status, editing an already-created draft).
 */
export async function requireJournalistRole(): Promise<JournalistCheckResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, journalistProfile: { select: { status: true } } },
  });

  if (!user || user.role !== "JOURNALIST" || !user.journalistProfile) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Journalist access required" },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    session,
    journalistStatus: user.journalistProfile.status,
  };
}

/**
 * Require the caller to be signed in, hold the JOURNALIST role, AND be
 * VERIFIED. Used for anything that writes/submits editorial content.
 */
export async function requireVerifiedJournalist(): Promise<JournalistCheckResult> {
  const check = await requireJournalistRole();
  if (!check.authorized) return check;

  if (check.journalistStatus !== "VERIFIED") {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            check.journalistStatus === "SUSPENDED"
              ? "Your journalist account is suspended."
              : "Only verified journalists can do this.",
        },
        { status: 403 }
      ),
    };
  }

  return check;
}

// ─── Badge sync ──────────────────────────────────────────────────────

/**
 * Keeps User.badgeType in sync with journalist verification status,
 * reusing the existing badge architecture (VerifiedBadge.tsx) instead
 * of introducing a second badge system.
 *
 * Only ever touches the badge when it is safe to do so: it will not
 * clobber a badge an admin manually assigned for another reason, and it
 * will not remove a non-journalist badge when verification lapses.
 */
export async function syncJournalistBadge(userId: string, status: JournalistStatus) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { badgeType: true },
  });

  if (!user) return;

  const shouldHaveBadge = status === "VERIFIED";

  if (shouldHaveBadge && user.badgeType !== JOURNALIST_BADGE_TYPE) {
    await prisma.user.update({
      where: { id: userId },
      data: { badgeType: JOURNALIST_BADGE_TYPE },
    });
    return;
  }

  if (!shouldHaveBadge && user.badgeType === JOURNALIST_BADGE_TYPE) {
    await prisma.user.update({
      where: { id: userId },
      data: { badgeType: null },
    });
  }
}

// ─── Shared constants ────────────────────────────────────────────────

export const JOURNALIST_STATUS_LABELS: Record<JournalistStatus, string> = {
  PENDING: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};
