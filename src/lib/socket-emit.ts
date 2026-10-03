/*
 * ============================================================
 * Server -> client realtime bridge for API routes
 * ============================================================
 *
 * server.js (the custom Node server - see CLAUDE.md) creates the one
 * Socket.IO instance for the whole process and hands off everything
 * else to Next's own request handler, which is where every
 * src/app/api/** route actually runs. Both share the same Node
 * process, so server.js stashes its `io` instance on `globalThis` right
 * after creating it - this module is the one place any API route reads
 * it back from, instead of every call site reaching into globalThis
 * directly.
 *
 * Never used to relay untrusted data: every call site passes a
 * server-verified recipient userId and a small, non-sensitive payload
 * (see createNotification's usage) - this is a "go re-fetch your real
 * state" ping, never the source of truth itself, matching the existing
 * "receive-message" pattern UnreadCountContext already reconciles with
 * a REST re-fetch rather than trusting the socket payload.
 *
 * Deliberately never throws: a missing/not-yet-initialized io instance
 * (e.g. `next dev` without server.js, or a unit test) or a mid-emit
 * error must never fail the business mutation that triggered it.
 */

interface ZrpGlobal {
  __zrpIO?: {
    to(room: string): { emit(event: string, payload?: unknown): void };
    in(room: string): {
      socketsLeave(room: string | string[]): void;
      disconnectSockets(close?: boolean): void;
    };
  };
}

export function emitToUser(userId: string, event: string, payload?: unknown): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.to(userId).emit(event, payload);
  } catch (err) {
    console.error(`socket emit failed for event "${event}":`, err);
  }
}

/**
 * Broadcasts to every socket currently joined to a Live Audio room's
 * dedicated Socket.IO room ("live-audio:<roomId>"), joined via
 * server.js's join-live-audio-room event (membership-checked there,
 * mirroring the existing group-chat join-conversation/groupRoom
 * pattern in socket-authz.js) - one `io.to(...).emit()` fans out to
 * every connected participant, not N individual emitToUser calls, so a
 * large room's broadcast stays O(1) server-side work regardless of how
 * many listeners are in it.
 */
export function emitToLiveAudioRoom(roomId: string, event: string, payload?: unknown): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.to(`live-audio:${roomId}`).emit(event, payload);
  } catch (err) {
    console.error(`socket emit failed for event "${event}":`, err);
  }
}

/**
 * Forcibly evicts every socket a removed/banned user currently has open
 * (every socket already sits in a room named by its own userId, the same
 * room emitToUser() targets) from a Live Audio room's broadcast channel.
 *
 * Without this, being "removed" only stopped a well-behaved client from
 * rejoining the broadcast room on its next connect (server.js's
 * join-live-audio-room re-checks membership) - a client that simply
 * ignored the polite "you-were-removed" event and never reconnected
 * would keep receiving that room's realtime metadata (who's speaking,
 * mute/role changes) indefinitely, even though its actual LiveKit audio
 * connection is separately force-dropped via forceDisconnectParticipant.
 * Exclusion is the entire point of "removed," so this closes that gap
 * rather than relying on client cooperation.
 */
export function evictUserFromLiveAudioRoom(userId: string, roomId: string): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.in(userId).socketsLeave(`live-audio:${roomId}`);
  } catch (err) {
    console.error("socket eviction from live-audio room failed:", err);
  }
}

/** Live Video rooms - same shape/rationale as emitToLiveAudioRoom() above. */
export function emitToLiveVideoRoom(roomId: string, event: string, payload?: unknown): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.to(`live-video:${roomId}`).emit(event, payload);
  } catch (err) {
    console.error(`socket emit failed for event "${event}":`, err);
  }
}

/** Live Video rooms - same shape/rationale as evictUserFromLiveAudioRoom() above. */
export function evictUserFromLiveVideoRoom(userId: string, roomId: string): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.in(userId).socketsLeave(`live-video:${roomId}`);
  } catch (err) {
    console.error("socket eviction from live-video room failed:", err);
  }
}

/**
 * ⚠️ SECURITY: the Socket.IO handshake re-checks `banned` against the
 * database (server.js), but that only runs at CONNECT time - a socket
 * already open when a ban lands keeps relaying DMs and placing/
 * accepting calls indefinitely (call-user/accept-call/reject-call have
 * no backing REST/DB write of their own to gate). Every socket a user
 * has open already sits in a room named by their own userId (the same
 * room emitToUser() targets), so force-disconnecting that room closes
 * every one of their open connections at once - the client's own
 * reconnect logic then re-runs the handshake and is correctly refused.
 * Mirrors the existing evictUserFromLiveAudioRoom pattern, generalized
 * to "end this user's realtime session entirely" rather than one room.
 */
export function disconnectAllSocketsForUser(userId: string): void {
  const io = (globalThis as ZrpGlobal).__zrpIO;
  if (!io) return;
  try {
    io.in(userId).disconnectSockets(true);
  } catch (err) {
    console.error("socket disconnect for banned user failed:", err);
  }
}
