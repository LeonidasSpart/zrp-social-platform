// server.js's own "send-group-message" handler (see its own KDoc)
// broadcasts a deliberately minimal real-time payload - just
// {id, senderId, conversationId, content, createdAt, read} - not the
// full sender profile, reactions, replyTo or imageUrl a REST-fetched
// message carries. That's fine for a 1:1 thread (ChatInterface already
// knows "the other party" from its own receiverName/receiverAvatar
// props, since there's only ever one), but a GROUP bubble needs a
// PER-MESSAGE sender identity - there's more than one possible "other"
// person. This fills that gap client-side from the conversation's own
// already-loaded participant list, so a real-time group message can
// render immediately with a real name/avatar instead of "Unknown"
// while the caller's own background REST sync (which DOES carry the
// full row, imageUrl included) catches up moments later.
export interface GroupParticipantLite {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

export interface RawGroupSocketMessage {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  createdAt: string;
  read?: boolean;
}

export interface HydratedGroupMessage {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  createdAt: string;
  imageUrl: string | null;
  edited?: boolean;
  replyTo: null;
  reactions: [];
  sender: GroupParticipantLite;
}

/**
 * `participants` should be the conversation's current member list
 * (each entry's own `.user` profile). A sender who has since LEFT the
 * group (their ConversationParticipant row deleted - see its own KDoc
 * on why that's real access revocation, not a soft flag) can still have
 * older messages attributed to them; this falls back to a generic
 * profile built from the raw senderId alone rather than crashing or
 * dropping the message, since Message.senderId itself is untouched by a
 * departure (only their own future access is revoked).
 */
export function hydrateGroupSocketMessage(
  raw: RawGroupSocketMessage,
  participants: GroupParticipantLite[]
): HydratedGroupMessage {
  const sender =
    participants.find((p) => p.id === raw.senderId) ??
    ({
      id: raw.senderId,
      username: raw.senderId,
      name: null,
      avatarUrl: null,
      badgeType: null,
    } satisfies GroupParticipantLite);

  return {
    id: raw.id,
    senderId: raw.senderId,
    conversationId: raw.conversationId,
    content: raw.content,
    createdAt: raw.createdAt,
    imageUrl: null,
    replyTo: null,
    reactions: [],
    sender,
  };
}
