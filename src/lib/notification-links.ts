// In-app deep-link target for a stored Notification row, used by the
// /notifications page. The Notification model only stores type,
// fromUserId, postId and commentId (no ticket/duel/listing/campaign id),
// so types without a post link to the recipient's own dashboard for that
// feature. Every path returned here must be a real page under src/app
// (enforced by src/lib/__tests__/notification-links.test.ts); falling back
// to the actor's profile is only correct for genuinely social types -
// for system notifications the "actor" is an admin/moderator, so linking
// to their profile would send the user somewhere meaningless.
export function getNotificationHref(n: {
  type: string;
  postId?: string | null;
  commentId?: string | null;
  fromUsername?: string | null;
}): string {
  const { type, postId, commentId, fromUsername } = n;

  switch (type) {
    case "message":
      return fromUsername ? `/messages/${encodeURIComponent(fromUsername)}` : "/messages";
    case "appeal_resolved":
      return "/settings/appeals";
    case "listing_approved":
    case "listing_rejected":
    case "listing_removed":
      return "/marketplace/my-listings";
    case "ticket_created":
      // Only ever sent to admins (notifyTicketCreated).
      return "/admin/support";
    case "ticket_reply":
    case "ticket_resolved":
    case "ticket_closed":
      return "/support/tickets";
    case "play_duel_challenge":
    case "play_duel_accepted":
    case "play_duel_result":
      return "/play/duels";
    case "opportunity_listing_approved":
    case "opportunity_listing_rejected":
    case "opportunity_listing_removed":
    case "opportunity_new_application":
      return "/opportunity/my-listings";
    case "opportunity_application_accepted":
    case "opportunity_application_rejected":
      return "/opportunity/my-applications";
    case "help_campaign_approved":
    case "help_campaign_rejected":
    case "help_campaign_removed":
    case "help_new_offer":
      // ZRP HELP campaign pages live under /aid (/help is the FAQ page).
      return "/aid/my-campaigns";
    case "music_artist_verified":
      return "/music";
    case "TIP":
    case "PURCHASE":
      return "/creator/dashboard";
  }

  if (postId) {
    return commentId ? `/post/${postId}?commentId=${commentId}` : `/post/${postId}`;
  }
  return fromUsername ? `/profile/${encodeURIComponent(fromUsername)}` : "/notifications";
}

// English action text for notification types that have no translation
// key yet - without it the row rendered as just the actor's name.
export const NOTIFICATION_FALLBACK_ACTION: Record<string, string> = {
  mention: "mentioned you in a post",
  ticket_reply: "replied to your support ticket",
  ticket_resolved: "resolved your support ticket",
  ticket_closed: "closed your support ticket",
  ticket_created: "created a new support ticket",
  play_duel_challenge: "challenged you to a ZRP PLAY duel",
  play_duel_accepted: "accepted your ZRP PLAY duel",
  play_duel_result: "finished your ZRP PLAY duel",
  opportunity_listing_approved: "approved your ZRP OPPORTUNITY listing",
  opportunity_listing_rejected: "didn't approve your ZRP OPPORTUNITY listing",
  opportunity_listing_removed: "removed your ZRP OPPORTUNITY listing",
  opportunity_new_application: "applied to your ZRP OPPORTUNITY listing",
  opportunity_application_accepted: "accepted your ZRP OPPORTUNITY application",
  opportunity_application_rejected: "didn't move forward with your ZRP OPPORTUNITY application",
  help_campaign_approved: "approved your ZRP HELP campaign",
  help_campaign_rejected: "didn't approve your ZRP HELP campaign",
  help_campaign_removed: "removed your ZRP HELP campaign",
  help_new_offer: "offered to help with your ZRP HELP campaign",
  music_artist_verified: "verified your ZRP Music Artist profile",
  TIP: "sent you a tip",
  PURCHASE: "unlocked your premium post",
};
