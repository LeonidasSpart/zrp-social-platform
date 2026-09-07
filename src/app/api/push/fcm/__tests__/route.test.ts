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
  return new NextRequest("https://zrp.one/api/push/fcm", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Regression coverage for the audit finding that POST /api/push/fcm
// hardcoded platform: "android" for every registered token, which would
// have mislabeled every iOS device once device push exists for iOS
// (ios-native/PARITY.md B3). The fix must (a) accept a real platform from
// the client, (b) keep defaulting to "android" for the already-shipped
// Android app, which has never sent one and must not have its tokens
// relabeled, and (c) never accept an arbitrary string as platform.
describe.skipIf(!hasRealDatabaseUrl)(
  "POST/DELETE /api/push/fcm (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const tokens: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@fcmroutetest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.fcmToken.deleteMany({ where: { token: { in: tokens } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("401s without a session, and never creates a token", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const token = `tok-${randomUUID()}`;
      const res = await POST(req({ token }));
      expect(res.status).toBe(401);
      expect(await prisma.fcmToken.findUnique({ where: { token } })).toBeNull();
    });

    it("400s when token is missing", async () => {
      const user = await createUser("notoken");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const res = await POST(req({}));
      expect(res.status).toBe(400);
    });

    it("defaults platform to android when the client sends none - the existing Android app's exact request shape", async () => {
      const user = await createUser("noplatform");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      const res = await POST(req({ token }));
      expect(res.status).toBe(200);

      const stored = await prisma.fcmToken.findUnique({ where: { token } });
      expect(stored?.platform).toBe("android");
    });

    it("stores platform: ios when the client sends it", async () => {
      const user = await createUser("ios");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      const res = await POST(req({ token, platform: "ios" }));
      expect(res.status).toBe(200);

      const stored = await prisma.fcmToken.findUnique({ where: { token } });
      expect(stored?.platform).toBe("ios");
    });

    it("is case-insensitive for a recognized platform", async () => {
      const user = await createUser("iosupper");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      await POST(req({ token, platform: "IOS" }));
      const stored = await prisma.fcmToken.findUnique({ where: { token } });
      expect(stored?.platform).toBe("ios");
    });

    it("falls back to android for an unrecognized platform value rather than storing it verbatim", async () => {
      const user = await createUser("bogus");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      await POST(req({ token, platform: "windows-phone" }));
      const stored = await prisma.fcmToken.findUnique({ where: { token } });
      expect(stored?.platform).toBe("android");
    });

    it("re-registering the same token (e.g. after switching accounts) updates platform too, not just userId", async () => {
      const userA = await createUser("switcha");
      const userB = await createUser("switchb");
      const token = `tok-${randomUUID()}`;
      tokens.push(token);

      getServerSession.mockResolvedValueOnce(sessionFor(userA.id));
      await POST(req({ token, platform: "android" }));

      getServerSession.mockResolvedValueOnce(sessionFor(userB.id));
      await POST(req({ token, platform: "ios" }));

      const stored = await prisma.fcmToken.findUnique({ where: { token } });
      expect(stored?.userId).toBe(userB.id);
      expect(stored?.platform).toBe("ios");
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
      expect(await prisma.fcmToken.findUnique({ where: { token } })).not.toBeNull();

      getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
      await DELETE(req({ token }, "DELETE"));
      expect(await prisma.fcmToken.findUnique({ where: { token } })).toBeNull();
    });
  }
);
