import { describe, it, expect } from "vitest";
import {
  createPresenceState,
  reconnectDelayMs,
  shouldReconnectAfterDisconnect,
  shouldRetryHandshake,
  RECONNECT_MAX_DELAY_MS,
} from "../presence-client";

// Regression coverage for the client half of the presence bug: a
// partner's transition that happened while THIS client's socket was
// down was missed, and the one-time get-status was never repeated, so
// the header showed a stale "Offline" until a page reload.
describe("presence client state", () => {
  it("records answers and distinguishes 'unknown' from 'offline'", () => {
    const s = createPresenceState();
    expect(s.hasStatus("alice")).toBe(false);
    expect(s.isOnline("alice")).toBe(false);
    s.apply("alice", "offline");
    expect(s.hasStatus("alice")).toBe(true);
    expect(s.isOnline("alice")).toBe(false);
    s.apply("alice", "online");
    expect(s.isOnline("alice")).toBe(true);
  });

  it("requests each watched id once while connected, and defers when disconnected", () => {
    const s = createPresenceState();
    expect(s.markRequested("alice", true)).toBe(true);
    expect(s.markRequested("alice", true)).toBe(false); // already asked
    expect(s.markRequested("bob", false)).toBe(false); // socket down: remembered, not sent
    expect(s.watched().sort()).toEqual(["alice", "bob"]);
    expect(s.markRequested("", true)).toBe(false);
  });

  it("re-requests EVERY watched id on (re)connect - the stale-presence fix", () => {
    const s = createPresenceState();
    s.markRequested("alice", true);
    s.markRequested("bob", false);
    s.apply("alice", "offline"); // last thing heard before we dropped
    s.onDisconnect();
    // While we are down, nothing we hold is trustworthy.
    expect(s.hasStatus("alice")).toBe(false);
    expect(s.onConnect().sort()).toEqual(["alice", "bob"]);
    // The re-request answers: alice came online while we were away.
    s.apply("alice", "online");
    expect(s.hasStatus("alice")).toBe(true);
    expect(s.isOnline("alice")).toBe(true);
  });

  it("reset forgets everything on sign-out", () => {
    const s = createPresenceState();
    s.markRequested("alice", true);
    s.apply("alice", "online");
    s.reset();
    expect(s.watched()).toEqual([]);
    expect(s.hasStatus("alice")).toBe(false);
    expect(s.isOnline("alice")).toBe(false);
  });
});

describe("socket reconnection policy", () => {
  it("retries a refused handshake, but not a ban, and not when socket.io will retry itself", () => {
    expect(shouldRetryHandshake("Unauthorized", false)).toBe(true);
    expect(shouldRetryHandshake("Too many active connections", false)).toBe(true);
    expect(shouldRetryHandshake(undefined, false)).toBe(true);
    expect(shouldRetryHandshake("Account banned", false)).toBe(false);
    expect(shouldRetryHandshake("Unauthorized", true)).toBe(false);
  });

  it("reconnects after a server-initiated disconnect only", () => {
    expect(shouldReconnectAfterDisconnect("io server disconnect")).toBe(true);
    expect(shouldReconnectAfterDisconnect("transport close")).toBe(false);
    expect(shouldReconnectAfterDisconnect("ping timeout")).toBe(false);
    expect(shouldReconnectAfterDisconnect(undefined)).toBe(false);
  });

  it("backs off exponentially and caps", () => {
    expect(reconnectDelayMs(0)).toBe(3_000);
    expect(reconnectDelayMs(1)).toBe(6_000);
    expect(reconnectDelayMs(3)).toBe(24_000);
    expect(reconnectDelayMs(10)).toBe(RECONNECT_MAX_DELAY_MS);
    expect(reconnectDelayMs(50)).toBe(RECONNECT_MAX_DELAY_MS);
  });
});
