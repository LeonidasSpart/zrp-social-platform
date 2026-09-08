import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for the native-v4 report "HTTP 404 after changing
// username/profile name and saving".
//
// Settings calls useSession().update() after every profile save, which
// runs authOptions.callbacks.jwt with trigger === "update". That branch
// re-reads the user from the database, but originally selected only
// isAdmin/role/badgeType/onboardingCompleted/banned/emailVerified/plan -
// never username. session.user.username is what BottomNav, Sidebar,
// Header and Settings all build `/profile/${username}` from, so after a
// rename every one of those links kept pointing at the old, now
// non-existent username and 404'd.

const findUnique = vi.fn();

vi.mock("../db", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

async function runUpdateJwt(token: Record<string, unknown>) {
  const { authOptions } = await import("../auth");
  const jwt = authOptions.callbacks!.jwt!;
  return jwt({ token, trigger: "update" } as never) as Promise<Record<string, unknown>>;
}

const FRESH = {
  username: "leo_new",
  name: "Leo New",
  avatarUrl: "https://uploadthing.com/f/new.png",
  isAdmin: true,
  role: "ADMIN",
  badgeType: "VERIFIED",
  onboardingCompleted: true,
  banned: false,
  emailVerified: new Date(),
  plan: "business",
};

beforeEach(() => {
  vi.resetModules();
  findUnique.mockReset();
  findUnique.mockResolvedValue(FRESH);
});

describe("jwt update() refreshes the identity fields a profile save can change", () => {
  it("replaces a stale username so /profile/<username> links stop 404ing", async () => {
    const result = await runUpdateJwt({ id: "u1", username: "leo_old" });
    expect(result.username).toBe("leo_new");
  });

  it("also refreshes display name and avatar, which the same save can change", async () => {
    const result = await runUpdateJwt({
      id: "u1",
      username: "leo_old",
      name: "Leo Old",
      avatarUrl: "https://uploadthing.com/f/old.png",
    });
    expect(result.name).toBe("Leo New");
    expect(result.avatarUrl).toBe("https://uploadthing.com/f/new.png");
  });

  it("actually selects username from the database rather than relying on the old token", async () => {
    await runUpdateJwt({ id: "u1", username: "leo_old" });
    const select = findUnique.mock.calls[0][0].select;
    expect(select.username).toBe(true);
    expect(select.name).toBe(true);
    expect(select.avatarUrl).toBe(true);
  });

  it("keeps refreshing the authorization fields it already refreshed", async () => {
    const result = await runUpdateJwt({ id: "u1", username: "leo_old", role: "USER", plan: "free" });
    expect(result.role).toBe("ADMIN");
    expect(result.isAdmin).toBe(true);
    expect(result.plan).toBe("business");
    expect(result.banned).toBe(false);
    expect(result.emailVerified).toBe(true);
  });

  it("leaves the token untouched when the user row has gone", async () => {
    findUnique.mockResolvedValue(null);
    const result = await runUpdateJwt({ id: "u1", username: "leo_old" });
    expect(result.username).toBe("leo_old");
  });
});
