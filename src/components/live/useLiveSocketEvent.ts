"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";

/**
 * Subscribes to one per-room Live event on the shared socket. The room
 * page has already emitted `join-live-audio-room`/`join-live-video-room`
 * on this same socket, so these events arrive on that channel - no
 * second join here, only the same socket.on()/socket.off() pairing the
 * pages use for their own listeners. The handler is held in a ref so a
 * re-render never tears down and re-adds the listener.
 */
export function useLiveSocketEvent<T>(myUserId: string | undefined, event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!myUserId) return;
    const socket = getSocket(myUserId);
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [myUserId, event]);
}
