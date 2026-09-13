import type { AdCampaignStatus } from "@prisma/client";

/**
 * The single authoritative map of legal AdCampaign status transitions,
 * keyed by who may trigger them. Every API route that changes
 * AdCampaign.status must check this map rather than hand-rolling its own
 * from/to logic, so there is exactly one place that answers "can X move
 * a campaign from A to B" for the whole app (web routes, cron, and any
 * future admin/advertiser surface).
 *
 * Deliberately NOT exported as a flat list of all next-states from a
 * given status - "who" matters: an advertiser paying a PAYMENT_PENDING
 * campaign and staff suspending an ACTIVE one are different actors with
 * different legal moves from different starting points.
 */
export type AdActor = "advertiser" | "staff" | "system";

const TRANSITIONS: Record<AdActor, Partial<Record<AdCampaignStatus, AdCampaignStatus[]>>> = {
  // The advertiser's own campaign, self-service.
  advertiser: {
    PAYMENT_PENDING: ["CANCELLED"],
    PAYMENT_FAILED: ["CANCELLED"],
    PENDING_REVIEW: ["CANCELLED"],
    ACTIVE: ["PAUSED", "CANCELLED"],
    PAUSED: ["ACTIVE", "CANCELLED"],
  },
  // Content moderation (approve/reject), post-launch enforcement
  // (suspend/resume), and a permanent stop (cancel) distinct from
  // suspend - a suspension can be resumed, a staff cancel cannot.
  // requireStaff() gates every route that uses this.
  staff: {
    PENDING_REVIEW: ["PAYMENT_PENDING", "REJECTED"],
    PAYMENT_PENDING: ["CANCELLED"],
    PAYMENT_FAILED: ["CANCELLED"],
    ACTIVE: ["SUSPENDED", "CANCELLED"],
    PAUSED: ["SUSPENDED", "CANCELLED"],
    SUSPENDED: ["ACTIVE", "CANCELLED"],
  },
  // Automated: the payment route (on-chain verification result) and the
  // expiry cron (endDate has passed / budget exhausted).
  system: {
    PAYMENT_PENDING: ["ACTIVE", "PAYMENT_FAILED"],
    PAYMENT_FAILED: ["ACTIVE"],
    ACTIVE: ["COMPLETED"],
    PAUSED: ["COMPLETED"],
    SUSPENDED: ["COMPLETED"],
  },
};

export function canTransition(actor: AdActor, from: AdCampaignStatus, to: AdCampaignStatus): boolean {
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

/** Statuses in which a campaign is actually eligible to be served/billed. */
export const SERVABLE_STATUS: AdCampaignStatus = "ACTIVE";

/** Terminal statuses - once here, a campaign never transitions again. */
export const TERMINAL_STATUSES: readonly AdCampaignStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];

export function isTerminal(status: AdCampaignStatus): boolean {
  return (TERMINAL_STATUSES as AdCampaignStatus[]).includes(status);
}
