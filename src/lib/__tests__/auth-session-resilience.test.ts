import { describe, it, expect, beforeEach, vi } from "vitest";

// NextAuth's session route (next-auth/core/routes/session.js) wraps the
// jwt() and session() callbacks in one try/catch whose catch branch
// pushes sessionStore.clean() - i.e. it DELETES the session cookie. So
// any exception thrown from jwt() during a routine session read signs
// the user out. Since the hardening moved an authoritative DB read into
// every jwt() invocation, a transient database error (pool timeout,
// failover, a blip) must degrade to "keep the claims we already verified
// on the last successful read", never to "throw and wipe the session".

const getUserAuthState = vi.fn();

vi.mock("../auth-state", async () => {
  const actual = await vi.importActual<typeof import("../auth-state")>("../auth-state");
  return { ...actual, getUserAuthState: (...args: unknown[]) => getUserAuthState(...args) };
});

vi.mock("../db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

beforeEach(() => {
  getUserAuthState.mockReset();
});

function activeState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    exists: true,
    banned: false,
    isAdmin: false,
    role: "USER",
    plan: "free",
    username: "alice",
    ...overrides,
  };
}

async function jwtCallback() {
  const { authOptions } = await import("../auth");
  return authOptions.callbacks!.jwt!;
}

describe("jwt() callback: authoritative refresh on routine session reads", () => {
  it("keeps a valid session when the database read throws (does not sign the user out)", async () => {
    getUserAuthState.mockRejectedValue(new Error("P2024 connection pool timeout"));
    const jwt = await jwtCallback();
    const token = await jwt({
      token: { id: "u1", role: "USER", isAdmin: false, plan: "free", banned: false, username: "alice" },
      user: undefined as never,
      account: null,
    } as never);
    expect(token.banned).toBe(false);
    expect(token.id).toBe("u1");
    expect(token.role).toBe("USER");
  });

  it("still applies a ban / deletion learned from a successful read", async () => {
    getUserAuthState.mockResolvedValue(activeState({ exists: false, banned: true }));
    const jwt = await jwtCallback();
    const token = await jwt({
      token: { id: "u1", role: "USER", banned: false },
      user: undefined as never,
      account: null,
    } as never);
    expect(token.banned).toBe(true);
  });

  it("still refreshes privileged claims from a successful read", async () => {
    getUserAuthState.mockResolvedValue(activeState({ role: "USER", isAdmin: false, plan: "pro" }));
    const jwt = await jwtCallback();
    const token = await jwt({
      token: { id: "u1", role: "ADMIN", isAdmin: true, plan: "free", banned: false },
      user: undefined as never,
      account: null,
    } as never);
    expect(token.isAdmin).toBe(false);
    expect(token.role).toBe("USER");
    expect(token.plan).toBe("pro");
  });

  it("a DB error never promotes a token that was already flagged banned", async () => {
    getUserAuthState.mockRejectedValue(new Error("db down"));
    const jwt = await jwtCallback();
    const token = await jwt({
      token: { id: "u1", role: "USER", banned: true },
      user: undefined as never,
      account: null,
    } as never);
    expect(token.banned).toBe(true);
  });
});

describe("session() callback", () => {
  it("returns no session for a banned token and a full session otherwise", async () => {
    const { authOptions } = await import("../auth");
    const session = authOptions.callbacks!.session!;
    const banned = await session({
      session: { user: { name: "a", email: "a@x", image: null }, expires: "" },
      token: { id: "u1", banned: true },
    } as never);
    expect(banned).toBeNull();

    const ok = await session({
      session: { user: { name: "a", email: "a@x", image: null }, expires: "" },
      token: { id: "u1", banned: false, username: "alice", role: "USER", plan: "free" },
    } as never);
    expect((ok as unknown as { user: { id: string } }).user.id).toBe("u1");
  });
});
