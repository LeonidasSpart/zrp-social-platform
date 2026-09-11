"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket-client";
import { createPresenceState, type PresenceStatus } from "@/lib/presence-client";

// Consumes the real online/offline signal server.js tracks and
// broadcasts (the presence tracker in /presence.js, shared across
// server instances through Redis, exposed as the "user-status" /
// "get-status" events) - nothing here invents presence.
//
// Every connected client receives every "user-status" transition, so
// this context keeps a running map of what it has heard. What it MUST
// also do - and previously did not - is re-synchronise after its own
// socket reconnects: any transition that happened while this client
// was disconnected (phone backgrounded, network blip, server redeploy)
// was missed, and the one-time "get-status" backfill was never
// repeated, so the header could show "Offline" for a partner who was
// actively chatting until the page was reloaded. Now every userId
// anyone has asked about is requested again on each (re)connect, and
// answers recorded before a disconnect are treated as unknown until
// refreshed. See src/lib/presence-client.ts.
interface PresenceContextType {
  isOnline: (userId: string) => boolean;
  // True once a fresh answer (a live broadcast or a get-status reply
  // since the current connection was established) has been recorded
  // for this userId - lets a caller tell "confirmed offline" apart from
  // "we don't know yet" instead of defaulting both to a plain false.
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
  const stateRef = useRef(createPresenceState());
  // Bumped on every change so consumers re-render (and get fresh
  // isOnline/hasStatus identities); the data itself lives in stateRef.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const state = stateRef.current;
    if (status !== "authenticated" || !session?.user?.id) {
      state.reset();
      bump();
      return;
    }

    const socket = getSocket(session.user.id);

    const handleStatus = (payload: { userId: string; status: PresenceStatus }) => {
      if (!payload || typeof payload.userId !== "string") return;
      state.apply(payload.userId, payload.status === "online" ? "online" : "offline");
      bump();
    };

    // (Re)connected: everything we watch may have changed while we were
    // away - ask again for all of it.
    const handleConnect = () => {
      for (const userId of state.onConnect()) {
        socket.emit("get-status", userId);
      }
    };

    const handleDisconnect = () => {
      state.onDisconnect();
      bump();
    };

    socket.on("user-status", handleStatus);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    // If the socket is already up (another consumer connected it
    // first), sync immediately instead of waiting for the next connect.
    if (socket.connected) handleConnect();

    return () => {
      socket.off("user-status", handleStatus);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [status, session?.user?.id, bump]);

  const requestStatus = useCallback(
    (userId: string) => {
      if (status !== "authenticated" || !session?.user?.id || !userId) return;
      const socket = getSocket(session.user.id);
      // First time asked while connected → request now. If the socket
      // is down, the id is remembered and requested on connect.
      if (stateRef.current.markRequested(userId, socket.connected)) {
        socket.emit("get-status", userId);
      }
    },
    [status, session?.user?.id]
  );

  // `version` is intentionally a dependency: it is what makes these
  // return fresh answers after each recorded change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isOnline = useCallback((userId: string) => stateRef.current.isOnline(userId), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasStatus = useCallback((userId: string) => stateRef.current.hasStatus(userId), [version]);

  return (
    <PresenceContext.Provider value={{ isOnline, hasStatus, requestStatus }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
