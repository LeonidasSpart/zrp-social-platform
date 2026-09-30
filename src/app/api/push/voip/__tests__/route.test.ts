import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST, DELETE } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(body: unknown, method: "POST" | "DELETE" = "POST") {
  return new NextRequest("https://zrp.one/api/push/voip", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Mirrors push/fcm/__tests__/route.test.ts's structure: this route is
// PushKit's VoIP-token analogue of /api/push/fcm - a structurally
// separate subscription (see prisma/schema.prisma's VoipToken doc
// comment), so it gets its own token-lifecycle test coverage rather than
// reusing FcmToken's.
describe.skipIf(!hasRealDatabaseUrl)(
  "POST/DELETE /api/push/voip (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const tokens: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@voiproutetest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.voipToken.deleteMany({ where: { token: { in: tokens } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("401s without a session, and never creates a token", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const token = `tok-${randomUUID()}`;
      const res = await POST(req({ token }));
      expect(res.status).toBe(401);
      expect(await prisma.voipToken.findUnique({ where: { token } })).toBeNull();
    });

    it("400s when token is missing", async () => {
      const user = await createUser("notoken");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const res = await POST(req({}));
      expect(res.status).toBe(400);
    });

    it("defaults platform to ios (the only real platform for VoIP push)", async () => {
      const user = await createUser("defaultplat");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      const res = await POST(req({ token }));
      expect(res.status).toBe(200);

      const stored = await prisma.voipToken.findUnique({ where: { token } });
      expect(stored?.platform).toBe("ios");
    });

    it("re-registering the same token (e.g. after switching accounts) moves it to the new owner", async () => {
      const userA = await createUser("switcha");
      const userB = await createUser("switchb");
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      getServerSession.mockResolvedValueOnce(sessionFor(userA.id));
      await POST(req({ token }));

      getServerSession.mockResolvedValueOnce(sessionFor(userB.id));
      await POST(req({ token }));

      const stored = await prisma.voipToken.findUnique({ where: { token } });
      expect(stored?.userId).toBe(userB.id);
    });

    it("DELETE only removes a token owned by the caller", async () => {
      const owner = await createUser("delowner");
      const attacker = await createUser("delattacker");
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
      await POST(req({ token }));

      getServerSession.mockResolvedValueOnce(sessionFor(attacker.id));
      await DELETE(req({ token }, "DELETE"));
      expect(await prisma.voipToken.findUnique({ where: { token } })).not.toBeNull();

      getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
      await DELETE(req({ token }, "DELETE"));
      expect(await prisma.voipToken.findUnique({ where: { token } })).toBeNull();
    });
  }
);
