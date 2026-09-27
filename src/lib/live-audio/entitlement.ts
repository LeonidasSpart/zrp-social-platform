import { prisma } from "@/lib/db";
import { getUserPlan, hasFeature, type Plan } from "@/lib/limits";
import { LiveAudioErrors } from "./errors";

/*
 * ============================================================
 * Live Audio paid-entitlement gate
 * ============================================================
 *
 * The single authoritative answer to "is this user allowed to use Live
 * Audio right now" - every mutating Live Audio action that constitutes
 * actual participation (create, start, join, get/refresh a LiveKit
 * token, request/grant/revoke speaking rights, mute, remove) calls
 * requireLiveAudioAccess() before touching any room state. Read-only
 * discovery (GET /rooms, GET /rooms/[id]) and exit paths (leave, end,
 * cancel) are deliberately NOT gated here - a lapsed subscriber must
 * still be able to see the upgrade CTA and get out of a room cleanly;
 * see docs/live-audio-architecture.md for the full rationale.
 *
 * Never trusts a cached view of plan/subscription state: both `User`
 * and `Subscription` are read fresh from Postgres on every call (no
 * auth-state/JWT cache involved), because the mission requirement this
 * implements is "a lapsed subscription must lose access immediately,"
 * not "within the auth-state cache's ~30s window."
 */

export type LiveAudioAccessDenialReason =
  | "free_plan"
  | "subscription_not_active"
  | "subscription_expired"
  | "plan_not_entitled";

export interface LiveAudioAccessResult {
  allowed: boolean;
  plan: Plan;
  reason?: LiveAudioAccessDenialReason;
}

/**
 * hasLiveAudioAccess, structured-result form. Resolves the user's
 * EFFECTIVE plan from the real subscription lifecycle, not the
 * denormalized `User.plan` cache alone:
 *
 * 1. A `Subscription` row exists: it alone decides. Must be `ACTIVE`
 *    AND `currentPeriodEnd` still in the future - checked against the
 *    clock on every call, not just the row's `status` column, so a
 *    subscription that lapsed minutes ago is denied even before the
 *    hourly `expireDueSubscriptions` cron sweeps it to `EXPIRED` (see
 *    docs/subscriptions.md's expiration engine section). `PENDING`,
 *    `CANCELED` and swept `EXPIRED` rows are all denied the same way.
 * 2. No `Subscription` row exists at all: this is the documented
 *    `NO_SUBSCRIPTION` reconciliation bucket (docs/subscriptions.md,
 *    "Admin Subscriptions & Billing" section) - a free user who never
 *    paid, or a legacy-paid user (`User.plan != "free"`) who predates
 *    the Subscription model and hasn't been run through
 *    `scripts/backfill-subscriptions.ts` yet (a manual, one-time
 *    operator step, never wired into CI/CD). Falling back to
 *    `User.plan` here is a deliberate, documented exception, not a
 *    loophole: it's exactly what every other paid feature in this app
 *    already grants that same user via
 *    `hasFeature(getUserPlan(user), ...)` in feature-status.ts, and
 *    denying them would be "accidentally revoking valid existing paid
 *    access" (an explicit non-goal of this feature).
 *
 * Fails closed in every other case, including an unexpected missing
 * `User` row (should be unreachable post-`requireActiveUser`, but this
 * function makes no assumption about its caller).
 */
export async function checkLiveAudioAccess(userId: string): Promise<LiveAudioAccessResult> {
  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true, currentPeriodEnd: true },
    }),
  ]);

  if (!user) return { allowed: false, plan: "free", reason: "free_plan" };

  if (subscription) {
    if (subscription.status !== "ACTIVE") {
      return { allowed: false, plan: getUserPlan(user), reason: "subscription_not_active" };
    }
    if (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() <= Date.now()) {
      return { allowed: false, plan: getUserPlan(user), reason: "subscription_expired" };
    }
    const plan = getUserPlan({ plan: subscription.plan });
    if (plan === "free") return { allowed: false, plan, reason: "free_plan" };
    return hasFeature(plan, "liveAudio")
      ? { allowed: true, plan }
      : { allowed: false, plan, reason: "plan_not_entitled" };
  }

  // No Subscription row - legacy-paid reconciliation fallback (see
  // doc comment above). Everyday free users (the overwhelming majority
  // of "no row" cases) simply fall out here too, via getUserPlan.
  const plan = getUserPlan(user);
  if (plan === "free") return { allowed: false, plan, reason: "free_plan" };
  return hasFeature(plan, "liveAudio")
    ? { allowed: true, plan }
    : { allowed: false, plan, reason: "plan_not_entitled" };
}

/**
 * requireLiveAudioAccess: the throwing form room-service.ts calls
 * directly, matching its existing `throw LiveAudioErrors.xxx()`
 * convention rather than returning a boolean callers might forget to
 * check. Logs the denial reason (never anything sensitive - no payment
 * data, no tokens) for observability per mission requirement; the
 * response the caller ultimately sees is always the same generic 403,
 * regardless of reason, so a client can't use the error to distinguish
 * "you're free" from "your room doesn't exist" from "your card lapsed."
 */
export async function requireLiveAudioAccess(userId: string): Promise<void> {
  const result = await checkLiveAudioAccess(userId);
  if (!result.allowed) {
    console.info(`Live Audio access denied (${result.reason ?? "unknown"}) for user ${userId}`);
    throw LiveAudioErrors.paidFeatureRequired();
  }
}
