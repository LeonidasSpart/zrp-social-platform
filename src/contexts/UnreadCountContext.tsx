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
  // up to 30s for the next poll - "receive-message" already exists and
  // fires server-side the moment someone sends this person a message.
  useEffect(() => {
    if (!session?.user?.id) return;
    const socket = getSocket(session.user.id);
    socket.on("receive-message", () => {
      fetchUnreadMessageCount();
    });
    return () => {
      socket.off("receive-message");
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
