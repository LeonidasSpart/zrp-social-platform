"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";

// Consumes the real online/offline signal server.js already tracks and
// broadcasts (userStatus Map + "user-status"/"get-status" events) -
// nothing here invents presence. Every connected client already
// receives every "user-status" broadcast the moment it happens
// (server.js's socket.broadcast.emit isn't scoped to a room), so this
// context just keeps a running map of what it's heard rather than
// polling; requestStatus's own "get-status" round trip only exists to
// backfill a userId whose current state was never actually seen (e.g.
// they were already online before this tab connected).
interface PresenceContextType {
  isOnline: (userId: string) => boolean;
  // True once a real answer (from either a live broadcast or a
  // get-status reply) has been recorded for this userId - lets a caller
  // tell "confirmed offline" apart from "we don't know yet" instead of
  // defaulting both to a plain false.
  hasStatus: (userId: string) => boolean;
  requestStatus: (userId: string) => void;
}

const PresenceContext = createContext<PresenceContextType>({
  isOnline: () => false,
  hasStatus: () => false,
  requestStatus: () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [statusMap, setStatusMap] = useState<Map<string, boolean>>(new Map());
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      setStatusMap(new Map());
      requestedRef.current = new Set();
      return;
    }

    const socket = getSocket(session.user.id);

    const handleStatus = (payload: { userId: string; status: "online" | "offline" }) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, payload.status === "online");
        return next;
      });
    };

    socket.on("user-status", handleStatus);
    return () => {
      socket.off("user-status", handleStatus);
    };
  }, [status, session?.user?.id]);

  const requestStatus = useCallback(
    (userId: string) => {
      if (status !== "authenticated" || !session?.user?.id || !userId) return;
      if (requestedRef.current.has(userId)) return;
      requestedRef.current.add(userId);
      const socket = getSocket(session.user.id);
      socket.emit("get-status", userId);
    },
    [status, session?.user?.id]
  );

  const isOnline = useCallback((userId: string) => statusMap.get(userId) === true, [statusMap]);
  const hasStatus = useCallback((userId: string) => statusMap.has(userId), [statusMap]);

  return (
    <PresenceContext.Provider value={{ isOnline, hasStatus, requestStatus }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
