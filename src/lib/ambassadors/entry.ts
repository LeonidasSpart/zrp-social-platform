import type { TranslationKey } from "@/lib/translations";

/**
 * The four real AmbassadorProfile.status values (see AmbassadorStatus
 * in prisma/schema.prisma). `null` means "never applied".
 */
export type MyAmbassadorStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

/**
 * Whether a profile in this status may (re)submit an application.
 * Mirrors POST /api/ambassadors/apply exactly: it returns 409 for
 * PENDING, APPROVED and SUSPENDED, and only accepts a fresh
 * application from someone who never applied or was REJECTED.
 */
export function canApplyWithStatus(status: MyAmbassadorStatus | null | undefined): boolean {
  return !status || status === "REJECTED";
}

/**
 * Where every "Become a ZRP Ambassador" entry point (hero CTA, country
 * panel CTA) should send the signed-in viewer, given their REAL
 * profile status from GET /api/ambassadors/me (a fresh DB read -
 * ambassador status is never a JWT/session claim).
 *
 * Someone who already holds a PENDING, APPROVED or SUSPENDED profile is
 * sent to /ambassadors/dashboard, which renders that state, instead of
 * to the application form the server would refuse anyway. This is the
 * root-cause fix for an approved ambassador still being offered the
 * "Become a ZRP Ambassador" form from the landing page.
 */
export function ambassadorEntryHref(
  status: MyAmbassadorStatus | null | undefined,
  countryCode?: string | null,
): string {
  if (canApplyWithStatus(status)) {
    return countryCode ? `/ambassadors/apply?country=${encodeURIComponent(countryCode)}` : "/ambassadors/apply";
  }
  return "/ambassadors/dashboard";
}

/**
 * The label for that same entry point. `applyKey` is the surface's own
 * "apply" wording (hero vs country panel); a pending applicant sees
 * their application state, an approved/suspended ambassador is offered
 * their dashboard - never "Become an Ambassador" for someone who
 * already is one.
 */
export function ambassadorEntryLabelKey(
  status: MyAmbassadorStatus | null | undefined,
  applyKey: TranslationKey,
): TranslationKey {
  if (canApplyWithStatus(status)) return applyKey;
  if (status === "PENDING") return "ambassadors.dashboard.pendingTitle";
  return "ambassadors.dashboard.title";
}
