import { describe, it, expect, beforeEach, vi } from "vitest";

// Unit coverage for the authoritative-authorization layer: a JWT's
// isAdmin/role/plan/banned claims are overlaid from the database on
// every read, so a demoted admin loses admin, a banned user loses the
// session, and a cached state is dropped the instant a privilege
// mutation invalidates it - without touching anyone else's session.

const findUnique = vi.fn();

vi.mock("../db", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const getTokenMock = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getTokenMock(...args),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("../auth", () => ({ authOptions: {} }));

function dbUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    banned: false,
    isAdmin: false,
    role: "USER",
    plan: "free",
    username: "alice",
    ...overrides,
  };
}

beforeEach(async () => {
  findUnique.mockReset();
  getTokenMock.mockReset();
  const { __resetAuthStateCacheForTests } = await import("../auth-state");
  __resetAuthStateCacheForTests();
});

describe("getUserAuthState / applyAuthStateToToken", () => {
  it("a demoted admin's old token no longer carries admin claims", async () => {
    const { getUserAuthState, applyAuthStateToToken, isAdminState } = await import("../auth-state");
    findUnique.mockResolvedValue(dbUser({ isAdmin: false, role: "USER" }));

    const staleToken: Record<string, unknown> = { id: "u1", isAdmin: true, role: "ADMIN", plan: "enterprise" };
    const state = await getUserAuthState("u1");
    const refreshed = applyAuthStateToToken(staleToken, state);

    expect(refreshed.isAdmin).toBe(false);
    expect(refreshed.role).toBe("USER");
    expect(refreshed.plan).toBe("free");
    expect(refreshed.banned).toBe(false);
    expect(isAdminState(state)).toBe(false);
  });

  it("a user banned after their token was minted is flagged banned", async () => {
    const { getUserAuthState, applyAuthStateToToken } = await import("../auth-state");
    findUnique.mockResolvedValue(dbUser({ banned: true }));

    const staleToken: Record<string, unknown> = { id: "u1", banned: false, role: "USER" };
    const refreshed = applyAuthStateToToken(staleToken, await getUserAuthState("u1"));
    expect(refreshed.banned).toBe(true);
  });

  it("a deleted account is treated exactly like a banned one", async () => {
    const { getUserAuthState, isAdminState, isModeratorState } = await import("../auth-state");
    findUnique.mockResolvedValue(null);

    const state = await getUserAuthState("gone");
    expect(state.exists).toBe(false);
    expect(state.banned).toBe(true);
    expect(isAdminState(state)).toBe(false);
    expect(isModeratorState(state)).toBe(false);
  });

  it("a real admin keeps admin (no collateral demotion)", async () => {
    const { getUserAuthState, isAdminState, isModeratorState } = await import("../auth-state");
    findUnique.mockResolvedValue(dbUser({ isAdmin: true, role: "ADMIN" }));
    const state = await getUserAuthState("u1");
    expect(isAdminState(state)).toBe(true);
    expect(isModeratorState(state)).toBe(true);
  });

  it("a banned admin is not an admin", async () => {
    const { getUserAuthState, isAdminState } = await import("../auth-state");
    findUnique.mockResolvedValue(dbUser({ isAdmin: true, role: "ADMIN", banned: true }));
    expect(isAdminState(await getUserAuthState("u1"))).toBe(false);
  });

  it("caches per instance, and invalidateUserAuthState makes a change take effect immediately", async () => {
    const { getUserAuthState, invalidateUserAuthState } = await import("../auth-state");
    findUnique.mockResolvedValueOnce(dbUser({ isAdmin: true, role: "ADMIN" }));
    expect((await getUserAuthState("u1")).isAdmin).toBe(true);

    // Demoted in the DB, but the cache still says admin...
    findUnique.mockResolvedValue(dbUser({ isAdmin: false, role: "USER" }));
    expect((await getUserAuthState("u1")).isAdmin).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);

    // ...until the mutation path invalidates it.
    invalidateUserAuthState("u1");
    expect((await getUserAuthState("u1")).isAdmin).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("fresh: true always bypasses the cache (used by every admin check)", async () => {
    const { getUserAuthState } = await import("../auth-state");
    findUnique.mockResolvedValueOnce(dbUser({ isAdmin: true, role: "ADMIN" }));
    await getUserAuthState("u1");
    findUnique.mockResolvedValue(dbUser({ isAdmin: false }));
    expect((await getUserAuthState("u1", { fresh: true })).isAdmin).toBe(false);
  });
});

describe("getVerifiedToken (drop-in for getToken on raw-JWT routes)", () => {
  it("returns null for a banned account even though the JWT itself is valid", async () => {
    const { getVerifiedToken } = await import("../auth-guards");
    getTokenMock.mockResolvedValue({ id: "u1", banned: false, role: "USER" });
    findUnique.mockResolvedValue(dbUser({ banned: true }));

    expect(await getVerifiedToken({ req: {} as never, secret: "s" })).toBeNull();
  });

  it("returns null for a deleted account", async () => {
    const { getVerifiedToken } = await import("../auth-guards");
    getTokenMock.mockResolvedValue({ id: "gone" });
    findUnique.mockResolvedValue(null);
    expect(await getVerifiedToken({ req: {} as never, secret: "s" })).toBeNull();
  });

  it("overlays current role/isAdmin/plan onto a stale token for an active user", async () => {
    const { getVerifiedToken } = await import("../auth-guards");
    getTokenMock.mockResolvedValue({ id: "u1", isAdmin: true, role: "ADMIN", plan: "business" });
    findUnique.mockResolvedValue(dbUser({ isAdmin: false, role: "USER", plan: "pro" }));

    const token = await getVerifiedToken({ req: {} as never, secret: "s" });
    expect(token).not.toBeNull();
    expect(token!.id).toBe("u1");
    expect(token!.isAdmin).toBe(false);
    expect(token!.role).toBe("USER");
    expect(token!.plan).toBe("pro");
  });

  it("passes through an unauthenticated request unchanged", async () => {
    const { getVerifiedToken } = await import("../auth-guards");
    getTokenMock.mockResolvedValue(null);
    expect(await getVerifiedToken({ req: {} as never, secret: "s" })).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("requireAdmin / requireModerator (src/lib/admin.ts)", () => {
  it("rejects a session whose JWT still claims admin after a DB demotion", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", isAdmin: true, role: "ADMIN" },
    });
    findUnique.mockResolvedValue(dbUser({ isAdmin: false, role: "USER" }));

    const { requireAdmin } = await import("../admin");
    const result = await requireAdmin();
    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(403);
  });

  it("accepts a real admin and a real moderator via the DB, not the JWT", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", isAdmin: false, role: "USER" },
    });
    findUnique.mockResolvedValue(dbUser({ isAdmin: false, role: "MODERATOR" }));

    const { requireAdmin, requireStaff } = await import("../admin");
    expect((await requireAdmin()).authorized).toBe(false);
    expect((await requireStaff()).authorized).toBe(true);

    findUnique.mockResolvedValue(dbUser({ isAdmin: true, role: "ADMIN" }));
    expect((await requireAdmin()).authorized).toBe(true);
  });

  it("rejects a banned user even if the session says admin", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", isAdmin: true, role: "ADMIN" },
    });
    findUnique.mockResolvedValue(dbUser({ isAdmin: true, role: "ADMIN", banned: true }));
    const { requireAdmin } = await import("../admin");
    expect((await requireAdmin()).authorized).toBe(false);
  });
});
