import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

// deleteUserAccountAndFiles goes through deleteUploadsIfUnreferenced, which
// itself calls deleteUploadThingKeys - mock that boundary so this test never
// calls real UploadThing.
const { deleteUploadThingKeys } = vi.hoisted(() => ({
  deleteUploadThingKeys: vi.fn(async (keys: string[]) => ({
    requested: keys.length,
    unique: keys.length,
    deleted: keys.length,
    failed: 0,
    retried: 0,
  })),
}));
vi.mock("@/lib/uploadthing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadthing")>();
  return { ...actual, deleteUploadThingKeys };
});

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(secret?: string) {
  const headers = new Headers();
  if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
  return GET(new NextRequest("https://zrp.one/api/cron/delete-scheduled-accounts", { headers }));
}

// Regression coverage for the account-deletion audit: User.deletionScheduledFor
// (set by POST /api/user/delete) was a promise nothing ever enforced - no
// cron swept expired grace periods, so a "scheduled for deletion" account
// stayed live forever unless the user came back and used the separate
// immediate-delete path themselves. This is the sweep that closes that gap,
// mirroring the CRON_SECRET auth already used by publish-scheduled-posts.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/cron/delete-scheduled-accounts (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = "test-secret";
      deleteUploadThingKeys.mockClear();
    });

    afterEach(() => {
      process.env.CRON_SECRET = originalSecret;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, deletionScheduledFor: Date | null) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@crondeltest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
          deletionScheduledFor,
          deletionRequestedAt: deletionScheduledFor ? new Date() : null,
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("rejects a request with no or an incorrect secret", async () => {
      expect((await call()).status).toBe(401);
      expect((await call("wrong")).status).toBe(401);
    });

    it("fails closed when CRON_SECRET is unset", async () => {
      delete process.env.CRON_SECRET;
      const res = await call("test-secret");
      expect(res.status).toBe(401);
    });

    it("deletes only accounts whose scheduled date has passed, leaving future ones untouched", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const due = await createUser("due", past);
      const notDue = await createUser("notdue", future);
      const neverScheduled = await createUser("never", null);

      const res = await call("test-secret");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("1 of 1");

      expect(await prisma.user.findUnique({ where: { id: due.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: notDue.id } })).not.toBeNull();
      expect(await prisma.user.findUnique({ where: { id: neverScheduled.id } })).not.toBeNull();
    });

    it("reports no accounts due when none have passed their scheduled date", async () => {
      await createUser("future2", new Date(Date.now() + 24 * 60 * 60 * 1000));
      const res = await call("test-secret");
      const body = await res.json();
      expect(body.message).toBe("No accounts due for deletion");
    });
  }
);
