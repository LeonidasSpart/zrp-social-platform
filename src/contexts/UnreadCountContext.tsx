"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";

interface UnreadCountContextType {
  unreadCount: number;
  refreshUnreadCount: () => void;
  // Separate from unreadCount (notifications) so the Messages nav item
  // can show its own badge, matching how X/most platforms distinguish
  // "someone messaged you" from general notifications rather than
  // lumping both under one bell icon.
  unreadMessageCount: number;
  refreshUnreadMessageCount: () => void;
}

const UnreadCountContext = createContext<UnreadCountContextType>({
  unreadCount: 0,
  refreshUnreadCount: () => {},
  unreadMessageCount: 0,
  refreshUnreadMessageCount: () => {},
});

export function UnreadCountProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const isAuthenticated = !!session;

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {
      // ignore
    }
  };

  const fetchUnreadMessageCount = async () => {
    try {
      const res = await fetch("/api/messages/unread");
      if (res.ok) {
        const data = await res.json();
        setUnreadMessageCount(data.count);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setUnreadMessageCount(0);
      return;
    }
    fetchUnreadCount();
    fetchUnreadMessageCount();
    const interval = setInterval(() => {
      fetchUnreadCount();
      fetchUnreadMessageCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Instant badge update on a new incoming message, rather than waiting
  // up to 30s for the next poll - "receive-message" (1:1) and
  // "receive-group-message" (group) both already exist and fire
  // server-side the moment someone sends this person a message. Named
  // handlers + off(event, handler) rather than a bare off(event) so this
  // cleanup can never remove a listener some OTHER mounted component
  // (e.g. an open group thread) registered for the same event on the
  // same shared socket singleton.
  useEffect(() => {
    if (!session?.user?.id) return;
    const socket = getSocket(session.user.id);
    const handleNewMessage = () => fetchUnreadMessageCount();
    socket.on("receive-message", handleNewMessage);
    socket.on("receive-group-message", handleNewMessage);
    return () => {
      socket.off("receive-message", handleNewMessage);
      socket.off("receive-group-message", handleNewMessage);
    };
  }, [session?.user?.id]);

  return (
    <UnreadCountContext.Provider
      value={{
        unreadCount,
        refreshUnreadCount: fetchUnreadCount,
        unreadMessageCount,
        refreshUnreadMessageCount: fetchUnreadMessageCount,
      }}
    >
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}
