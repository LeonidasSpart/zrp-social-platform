"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";
import {
  buildUnifiedConversationList,
  type DirectConversationInput,
  type GroupConversationInput,
  type UnifiedConversation,
} from "@/lib/unifiedConversations";

/**
 * Shared by messages/page.tsx (mobile list) and messages/layout.tsx
 * (desktop sidebar) so the real fetch-both-sources-and-merge logic, and
 * the real-time socket wiring that keeps it current, exist in exactly
 * one place instead of being duplicated (and drifting) between the two.
 * Real data only - GET /api/messages (1:1) and GET /api/conversations
 * (GROUP) are the same two endpoints either surface already called on
 * its own before groups existed.
 */
export function useConversationList() {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<UnifiedConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [directRes, groupRes] = await Promise.all([
        fetch("/api/messages", { cache: "no-store" }),
        fetch("/api/conversations", { cache: "no-store" }),
      ]);

      const direct: DirectConversationInput[] = directRes.ok ? await directRes.json() : [];
      const groups: GroupConversationInput[] = groupRes.ok ? await groupRes.json() : [];

      setConversations(
        buildUnifiedConversationList(
          Array.isArray(direct) ? direct : [],
          Array.isArray(groups) ? groups : []
        )
      );
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      refresh();
    } else if (status === "unauthenticated") {
      setConversations([]);
      setLoading(false);
    }
  }, [status, refresh]);

  // Real-time: a new incoming/sent 1:1 or group message, or an unblock
  // that deleted a stale 1:1 conversation, all just trigger a real
  // re-fetch rather than trying to hand-patch the merged+sorted list in
  // place - the list is small (one row per real conversation) so a
  // re-fetch is cheap and can never drift from the two real sources.
  // Named handlers + off(event, handler) so this cleanup never removes a
  // listener some other mounted component (e.g. UnreadCountContext, or
  // an open thread) registered for the same event on the shared socket.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const socket = getSocket(session.user.id);
    const handleUpdate = () => refresh();
    const handleConversationDeleted = ({ withUserId }: { withUserId: string }) => {
      setConversations((prev) =>
        prev.filter((c) => !(c.type === "direct" && c.partner.id === withUserId))
      );
    };

    socket.on("receive-message", handleUpdate);
    socket.on("message-sent", handleUpdate);
    socket.on("receive-group-message", handleUpdate);
    socket.on("conversation-deleted", handleConversationDeleted);

    return () => {
      socket.off("receive-message", handleUpdate);
      socket.off("message-sent", handleUpdate);
      socket.off("receive-group-message", handleUpdate);
      socket.off("conversation-deleted", handleConversationDeleted);
    };
  }, [status, session?.user?.id, refresh]);

  return { conversations, loading, refresh };
}
