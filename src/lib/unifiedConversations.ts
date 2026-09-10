// Merges the two conversation sources the messages UI already fetches
// separately - real 1:1 conversations (GET /api/messages, one row per
// partner) and real GROUP conversations (GET /api/conversations, one row
// per group the user currently belongs to) - into a single list sorted
// by most-recent activity, for the unified conversation list both
// messages/page.tsx (mobile) and messages/layout.tsx (desktop sidebar)
// render. A group's own "/messages/group/{id}" route matches exactly
// what the backend's own group push notifications already link to (see
// conversations/[id]/messages/route.ts's own sendPushNotification call).

export interface DirectConversationInput {
  partner: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

export interface GroupConversationInput {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  participantCount: number;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    sender: { id: string; username: string; name: string | null };
  } | null;
  unreadCount: number;
}

export type UnifiedConversation =
  | ({
      type: "direct";
      key: string;
      href: string;
      sortTime: number;
    } & DirectConversationInput)
  | ({
      type: "group";
      key: string;
      href: string;
      sortTime: number;
    } & GroupConversationInput);

/**
 * Real activity time only - a group with no messages yet (just created,
 * nobody has said anything) sorts as if it happened at the epoch rather
 * than "now", so a chatty 1:1 conversation correctly outranks a silent
 * new group instead of a fabricated "just created" timestamp jumping it
 * to the top.
 */
function activityTime(createdAt: string | undefined | null): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function buildUnifiedConversationList(
  direct: DirectConversationInput[],
  groups: GroupConversationInput[]
): UnifiedConversation[] {
  const directEntries: UnifiedConversation[] = direct.map((c) => ({
    type: "direct",
    key: `direct:${c.partner.id}`,
    href: `/messages/${c.partner.username}`,
    sortTime: activityTime(c.lastMessage?.createdAt),
    ...c,
  }));

  const groupEntries: UnifiedConversation[] = groups.map((g) => ({
    type: "group",
    key: `group:${g.id}`,
    href: `/messages/group/${g.id}`,
    sortTime: activityTime(g.lastMessage?.createdAt),
    ...g,
  }));

  // A stable sort keeps ties (same millisecond, or two groups with no
  // messages at all) in their original fetch order rather than
  // reshuffling on every render.
  return [...directEntries, ...groupEntries].sort((a, b) => b.sortTime - a.sortTime);
}
