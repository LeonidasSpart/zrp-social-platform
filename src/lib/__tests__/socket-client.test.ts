import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Regression coverage for a real cross-account identity leak: getSocket()
 * used to reuse the same live connection for any userId it was called
 * with, only re-emitting "join-room" - but the server never re-runs its
 * auth handshake on an already-connected socket, and "join-room" itself
 * ignores the client's payload and re-confirms the room from
 * socket.data.userId (the identity verified at the connection's
 * ORIGINAL handshake). So calling getSocket("userB") after
 * getSocket("userA") handed back the SAME socket, still authenticated,
 * joined and attributed as userA - exactly the scenario a logout
 * followed by a different login in the same tab (no full page reload),
 * or NextAuth's own cross-tab session sync, can produce.
 *
 * These tests mock socket.io-client's `io()` factory so no real network
 * connection is attempted; each mock socket is a distinct object with
 * its own spied `disconnect()`/`emit()`, which is what lets the
 * assertions below tell "the same connection was reused" apart from
 * "a new one was created" without needing a real server.
 */

const { ioMock, createMockSocket } = vi.hoisted(() => {
  function createMockSocket() {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      connected: true,
      active: true,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        (handlers[event] ||= []).push(handler);
      }),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      __handlers: handlers,
    };
  }
  return { ioMock: vi.fn(), createMockSocket };
});

vi.mock("socket.io-client", () => ({ io: ioMock }));

describe("getSocket() identity binding", () => {
  beforeEach(() => {
    vi.resetModules();
    ioMock.mockReset();
  });

  it("reuses the same connection for repeated calls with the SAME userId", async () => {
    const mockSocket = createMockSocket();
    ioMock.mockReturnValue(mockSocket);
    const { getSocket } = await import("../socket-client");

    const first = getSocket("alice");
    const second = getSocket("alice");

    expect(first).toBe(second);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it("tears down the old connection and creates a NEW one when called with a DIFFERENT userId", async () => {
    const socketA = createMockSocket();
    const socketB = createMockSocket();
    ioMock.mockReturnValueOnce(socketA).mockReturnValueOnce(socketB);
    const { getSocket } = await import("../socket-client");

    const forAlice = getSocket("alice");
    expect(forAlice).toBe(socketA);

    const forBob = getSocket("bob");

    // The connection that was authenticated as alice must be
    // disconnected, never left alive and reused for bob.
    expect(socketA.disconnect).toHaveBeenCalledTimes(1);
    expect(forBob).toBe(socketB);
    expect(forBob).not.toBe(socketA);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it("a subsequent call for the ORIGINAL user after switching away and back gets a fresh connection too, not the stale first one", async () => {
    const socketA1 = createMockSocket();
    const socketB = createMockSocket();
    const socketA2 = createMockSocket();
    ioMock.mockReturnValueOnce(socketA1).mockReturnValueOnce(socketB).mockReturnValueOnce(socketA2);
    const { getSocket } = await import("../socket-client");

    getSocket("alice");
    getSocket("bob"); // switch away - alice's socket torn down
    const backToAlice = getSocket("alice"); // switch back

    expect(socketB.disconnect).toHaveBeenCalledTimes(1);
    expect(backToAlice).toBe(socketA2);
    expect(backToAlice).not.toBe(socketA1);
  });

  it("disconnectSocket() clears the bound identity so the next getSocket() call always creates fresh, regardless of userId", async () => {
    const socketA = createMockSocket();
    const socketA2 = createMockSocket();
    ioMock.mockReturnValueOnce(socketA).mockReturnValueOnce(socketA2);
    const { getSocket, disconnectSocket } = await import("../socket-client");

    getSocket("alice");
    disconnectSocket();
    expect(socketA.disconnect).toHaveBeenCalledTimes(1);

    const fresh = getSocket("alice");
    expect(fresh).toBe(socketA2);
    expect(fresh).not.toBe(socketA);
  });
});
