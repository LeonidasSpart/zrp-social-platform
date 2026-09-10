/*
 * Client-side presence bookkeeping shared by PresenceContext - kept as
 * plain functions so the behaviour can be unit-tested without React.
 *
 * The bug this fixes: PresenceContext recorded each "user-status" it
 * heard and asked the server ("get-status") exactly once per userId,
 * ever. Any transition that happened while THIS client's socket was
 * down (phone backgrounded, network blip, server redeploy) was simply
 * missed, and because the one-time request was never repeated, the
 * stale answer - typically "offline" - stuck for the whole page
 * lifetime. That is how a partner who is actively chatting shows as
 * Offline in the conversation header.
 *
 * The rule is now: every userId anyone has ever asked about is
 * re-requested on every (re)connect, and statuses recorded before a
 * disconnect are marked stale until refreshed.
 */

export type PresenceStatus = "online" | "offline";

export interface PresenceState {
  /** Record a server answer or broadcast. */
  apply(userId: string, status: PresenceStatus): void;
  isOnline(userId: string): boolean;
  /** True once a fresh (post-connect) answer exists for this userId. */
  hasStatus(userId: string): boolean;
  /**
   * Register interest in a userId. Returns true when a `get-status`
   * should be emitted now (first time asked while connected); if the
   * socket is not connected the id is remembered and requested on
   * connect instead.
   */
  markRequested(userId: string, connected: boolean): boolean;
  /** The socket (re)connected: every watched id must be requested again. */
  onConnect(): string[];
  /** The socket dropped: keep last-known values but flag them stale. */
  onDisconnect(): void;
  /** Forget everything (sign-out). */
  reset(): void;
  watched(): string[];
}

export function createPresenceState(): PresenceState {
  const status = new Map<string, boolean>();
  const fresh = new Set<string>();
  const watched = new Set<string>();

  return {
    apply(userId, s) {
      status.set(userId, s === "online");
      fresh.add(userId);
    },
    isOnline(userId) {
      return status.get(userId) === true;
    },
    hasStatus(userId) {
      return fresh.has(userId);
    },
    markRequested(userId, connected) {
      if (!userId) return false;
      const isNew = !watched.has(userId);
      watched.add(userId);
      return isNew && connected;
    },
    onConnect() {
      return Array.from(watched);
    },
    onDisconnect() {
      fresh.clear();
    },
    reset() {
      status.clear();
      fresh.clear();
      watched.clear();
    },
    watched() {
      return Array.from(watched);
    },
  };
}

/*
 * Socket.IO client reconnection policy.
 *
 * socket.io-client only reconnects on its own for TRANSPORT failures.
 * When the server refuses the connection in its handshake middleware
 * (`connect_error` with `socket.active === false`), or actively closes
 * it (`disconnect` with reason "io server disconnect"), the client
 * stays down until something calls `socket.connect()` again. A single
 * transient refusal - the session cookie not yet readable a moment
 * after login, a database hiccup in the handshake's ban check - would
 * otherwise leave a user "Offline" for everyone for the rest of the
 * page lifetime, while their REST calls keep working normally.
 */
export const RECONNECT_BASE_DELAY_MS = 3_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;

/** Errors that mean "stop trying": reconnecting cannot change the answer. */
const PERMANENT_HANDSHAKE_ERRORS = ["Account banned"];

export function shouldRetryHandshake(errorMessage: string | undefined, active: boolean): boolean {
  if (active) return false; // socket.io will retry by itself
  if (errorMessage && PERMANENT_HANDSHAKE_ERRORS.includes(errorMessage)) return false;
  return true;
}

export function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(attempt, 10);
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** exp, RECONNECT_MAX_DELAY_MS);
}

export function shouldReconnectAfterDisconnect(reason: string | undefined): boolean {
  // Only this reason disables socket.io's own auto-reconnect.
  return reason === "io server disconnect";
}
