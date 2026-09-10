// Shared shape of a real group Conversation, matching exactly what
// GET/PATCH /api/conversations/[id] and POST .../participants return
// (see PARTICIPANT_INCLUDE in those routes) - kept in one place so
// GroupChatInterface and GroupInfoPanel never drift on field names.
export interface GroupParticipantUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

export interface GroupParticipant {
  id: string;
  conversationId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
  lastReadAt: string | null;
  user: GroupParticipantUser;
}

export interface GroupConversationDetail {
  id: string;
  type: "GROUP" | "DIRECT";
  name: string | null;
  avatarUrl: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  participants: GroupParticipant[];
}
