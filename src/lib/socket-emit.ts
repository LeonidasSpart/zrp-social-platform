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
