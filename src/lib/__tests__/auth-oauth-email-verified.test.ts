import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique,
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { authOptions } from "../auth";

const EXISTING_USER = {
  id: "user-1",
  email: "victim@example.com",
  name: "Victim",
  username: "victim",
  isAdmin: false,
  role: "USER",
  badgeType: null,
  avatarUrl: null,
  onboardingCompleted: true,
  banned: false,
  emailVerified: new Date(),
  plan: "free",
};

// ⚠️ SECURITY regression coverage (H2): the web OAuth signIn callback used
// to link/log in a user purely on the provider-claimed email string,
// never checking the OIDC `email_verified` claim on the raw `profile`
// argument (NextAuth's own GoogleProvider.profile() mapping drops that
// claim from `user`). An identity provider that allows an unverified
// email (e.g. a compromised/misconfigured OAuth app, or a provider that
// permits sign-in before email confirmation) could otherwise link to an
// existing ZRP account without proving control of that email address -
// the same class of check the mobile Google endpoint
// (POST /api/mobile/auth/google) already enforces against its own
// verified id_token.
describe("authOptions.callbacks.signIn - OAuth email_verified (H2)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(EXISTING_USER);
  });

  const signIn = authOptions.callbacks!.signIn!;

  it("rejects a Google sign-in whose profile explicitly claims email_verified: false", async () => {
    const result = await signIn({
      user: { email: "victim@example.com", name: "Attacker-controlled name" } as any,
      account: { provider: "google" } as any,
      profile: { email_verified: false } as any,
    } as any);

    expect(result).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a Google sign-in whose profile claims email_verified as the string \"false\"", async () => {
    const result = await signIn({
      user: { email: "victim@example.com" } as any,
      account: { provider: "google" } as any,
      profile: { email_verified: "false" } as any,
    } as any);

    expect(result).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows a Google sign-in whose profile claims email_verified: true", async () => {
    const result = await signIn({
      user: { email: "victim@example.com" } as any,
      account: { provider: "google" } as any,
      profile: { email_verified: true } as any,
    } as any);

    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalled();
  });

  it("does not block a provider profile that omits the email_verified claim entirely (e.g. Apple)", async () => {
    const result = await signIn({
      user: { email: "victim@example.com" } as any,
      account: { provider: "apple" } as any,
      profile: {} as any,
    } as any);

    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalled();
  });

  it("still rejects when there is no email at all, unaffected by the new check", async () => {
    const result = await signIn({
      user: { email: undefined } as any,
      account: { provider: "google" } as any,
      profile: { email_verified: true } as any,
    } as any);

    expect(result).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
