import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// GET /api/wallet feeds the withdrawal UI's "verified payout wallet"
// panel. It must only ever describe the caller's own account.
describe.skipIf(!hasRealDatabaseUrl)("GET /api/wallet (integration, real Postgres)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string, verifiedSolanaWallet: string | null) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@wallet.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet,
      },
    });
    userIds.push(user.id);
    return user;
  }

  it("401s when logged out", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the caller's own verified wallet, or null when none is linked", async () => {
    const wallet = `W${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const linked = await createUser("walletok", wallet);
    const unlinked = await createUser("walletnone", null);

    getServerSession.mockResolvedValue({ user: { id: linked.id } });
    expect(await (await GET()).json()).toEqual({ verifiedSolanaWallet: wallet });

    getServerSession.mockResolvedValue({ user: { id: unlinked.id } });
    expect(await (await GET()).json()).toEqual({ verifiedSolanaWallet: null });
  });
});
