import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { getUserConversations } from "../conversations";

// Integration tests against a real Postgres instance - skipped
// automatically when DATABASE_URL is unset or still the repo's
// placeholder ("postgresql://..."), so `npm test` stays safe to run
// anywhere without a live database.
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)(
  "getUserConversations (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const testUserIds: string[] = [];
    const testMessageIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@convtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      testUserIds.push(user.id);
      return user;
    }

    // Explicit id + createdAt so the test can compute ground truth
    // independently of the function under test, and so ordering is
    // deterministic instead of depending on insert timing.
    async function createMessage(opts: {
      senderId: string;
      receiverId: string;
      createdAt: Date;
      read?: boolean;
    }) {
      const id = randomUUID();
      await prisma.message.create({
        data: {
          id,
          content: "test message",
          senderId: opts.senderId,
          receiverId: opts.receiverId,
          read: opts.read ?? false,
          createdAt: opts.createdAt,
        },
      });
      testMessageIds.push(id);
      return id;
    }

    let alice: { id: string };
    // Ground truth, built independently of getUserConversations.
    const expectedLatestMessageId = new Map<string, string>();
    const expectedUnreadCount = new Map<string, number>();
    let expectedPartnerIds: Set<string>;

    let manyPartner: { id: string };
    let manyPartnerMessageCount = 0;
    let outboundOnlyPartner: { id: string };
    let inboundOnlyPartner: { id: string };
    let tieBreakPartner: { id: string };
    let tieBreakLatestId: string;

    beforeAll(async () => {
      alice = await createUser("alice");

      // Base timestamp far enough back that many spaced-out messages
      // (1 minute apart) don't collide with "now".
      const base = new Date("2020-01-01T00:00:00Z").getTime();
      let clock = base;
      const nextTime = () => new Date((clock += 60_000));

      // ── 20 ordinary partners, a handful of messages each, mixed
      // directions and read state ──────────────────────────────────
      for (let i = 0; i < 20; i++) {
        const partner = await createUser(`p${i}`);
        let latestId = "";
        let latestTime = 0;
        let unread = 0;

        const messageCount = 2 + (i % 5); // 2-6 messages
        for (let m = 0; m < messageCount; m++) {
          const fromAlice = m % 2 === 0;
          const t = nextTime();
          const read = m % 3 !== 0; // some unread mixed in
          const id = await createMessage({
            senderId: fromAlice ? alice.id : partner.id,
            receiverId: fromAlice ? partner.id : alice.id,
            createdAt: t,
            read,
          });
          if (t.getTime() >= latestTime) {
            latestTime = t.getTime();
            latestId = id;
          }
          if (!fromAlice && !read) unread++;
        }

        expectedLatestMessageId.set(partner.id, latestId);
        expectedUnreadCount.set(partner.id, unread);
      }

      // ── High-volume single conversation (300 messages) - proves
      // correctness holds, and that only ONE entry comes back no
      // matter how many messages exist for that partner ────────────
      manyPartner = await createUser("manypartner");
      {
        let latestId = "";
        let latestTime = 0;
        let unread = 0;
        for (let m = 0; m < 300; m++) {
          const fromAlice = m % 2 === 0;
          const t = nextTime();
          const read = m < 295; // last few unread
          const id = await createMessage({
            senderId: fromAlice ? alice.id : manyPartner.id,
            receiverId: fromAlice ? manyPartner.id : alice.id,
            createdAt: t,
            read,
          });
          manyPartnerMessageCount++;
          if (t.getTime() >= latestTime) {
            latestTime = t.getTime();
            latestId = id;
          }
          if (!fromAlice && !read) unread++;
        }
        expectedLatestMessageId.set(manyPartner.id, latestId);
        expectedUnreadCount.set(manyPartner.id, unread);
      }

      // ── One-directional: partner only ever sent to Alice ──────────
      outboundOnlyPartner = await createUser("outboundonly");
      {
        let latestId = "";
        let latestTime = 0;
        for (let m = 0; m < 4; m++) {
          const t = nextTime();
          const id = await createMessage({
            senderId: outboundOnlyPartner.id,
            receiverId: alice.id,
            createdAt: t,
            read: false,
          });
          if (t.getTime() >= latestTime) {
            latestTime = t.getTime();
            latestId = id;
          }
        }
        expectedLatestMessageId.set(outboundOnlyPartner.id, latestId);
        expectedUnreadCount.set(outboundOnlyPartner.id, 4);
      }

      // ── Reverse one-directional: Alice only ever sent to partner ──
      inboundOnlyPartner = await createUser("inboundonly");
      {
        let latestId = "";
        let latestTime = 0;
        for (let m = 0; m < 3; m++) {
          const t = nextTime();
          const id = await createMessage({
            senderId: alice.id,
            receiverId: inboundOnlyPartner.id,
            createdAt: t,
          });
          if (t.getTime() >= latestTime) {
            latestTime = t.getTime();
            latestId = id;
          }
        }
        expectedLatestMessageId.set(inboundOnlyPartner.id, latestId);
        expectedUnreadCount.set(inboundOnlyPartner.id, 0);
      }

      // ── Tie-break: two messages at the EXACT same timestamp - must
      // not cause the partner to vanish or duplicate ────────────────
      tieBreakPartner = await createUser("tiebreak");
      {
        const t = nextTime();
        const idA = await createMessage({
          senderId: alice.id,
          receiverId: tieBreakPartner.id,
          createdAt: t,
        });
        const idB = await createMessage({
          senderId: tieBreakPartner.id,
          receiverId: alice.id,
          createdAt: t,
          read: false,
        });
        // Ground truth uses the same tiebreaker as the implementation
        // (id DESC among equal timestamps).
        tieBreakLatestId = idA > idB ? idA : idB;
        expectedLatestMessageId.set(tieBreakPartner.id, tieBreakLatestId);
        // Unread count is independent of which message displays as
        // "latest" - idB (partner -> alice) is seeded unread regardless
        // of how the tiebreak resolves, so the expected count is always 1.
        expectedUnreadCount.set(tieBreakPartner.id, 1);
      }

      // ── Self-conversation: Alice messages herself ──────────────────
      {
        const t = nextTime();
        const id = await createMessage({
          senderId: alice.id,
          receiverId: alice.id,
          createdAt: t,
          read: false,
        });
        expectedLatestMessageId.set(alice.id, id);
        // receiverId === userId and read === false -> counts as unread
        // from "themself" in the groupBy, matching current/legacy
        // behavior exactly (this test locks in parity, not a new rule).
        expectedUnreadCount.set(alice.id, 1);
      }

      expectedPartnerIds = new Set(expectedLatestMessageId.keys());
    }, 60_000);

    afterAll(async () => {
      // Messages cascade-delete when their users are deleted (schema
      // onDelete: Cascade on both sender and receiver relations), but
      // deleting explicitly first avoids relying on that ordering.
      await prisma.message.deleteMany({ where: { id: { in: testMessageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    });

    it("returns exactly one conversation per partner - none missing, none duplicated", async () => {
      const result = await getUserConversations(alice.id);
      const actualPartnerIds = result.map((c) => c.partner.id);

      expect(new Set(actualPartnerIds)).toEqual(expectedPartnerIds);
      expect(actualPartnerIds.length).toBe(new Set(actualPartnerIds).size); // no duplicates
      expect(result.length).toBe(expectedPartnerIds.size);
    });

    it("returns the true latest message for every conversation, including the self-conversation", async () => {
      const result = await getUserConversations(alice.id);
      const byPartner = new Map(result.map((c) => [c.partner.id, c]));

      expectedLatestMessageId.forEach((expectedId, partnerId) => {
        const actual = byPartner.get(partnerId);
        expect(actual, `missing conversation for partner ${partnerId}`).toBeDefined();
        expect(actual!.lastMessage.id).toBe(expectedId);
      });
    });

    it("does not lose the conversation under high message volume (300 messages, still exactly 1 entry)", async () => {
      const result = await getUserConversations(alice.id);
      const matches = result.filter((c) => c.partner.id === manyPartner.id);
      expect(matches.length).toBe(1);
      expect(matches[0].lastMessage.id).toBe(expectedLatestMessageId.get(manyPartner.id));
      expect(manyPartnerMessageCount).toBe(300); // sanity check on the seed itself
    });

    it("handles a one-directional conversation (partner only ever sent)", async () => {
      const result = await getUserConversations(alice.id);
      const conv = result.find((c) => c.partner.id === outboundOnlyPartner.id);
      expect(conv).toBeDefined();
      expect(conv!.lastMessage.senderId).toBe(outboundOnlyPartner.id);
      expect(conv!.unreadCount).toBe(4);
    });

    it("handles the reverse one-directional conversation (Alice only ever sent)", async () => {
      const result = await getUserConversations(alice.id);
      const conv = result.find((c) => c.partner.id === inboundOnlyPartner.id);
      expect(conv).toBeDefined();
      expect(conv!.lastMessage.senderId).toBe(alice.id);
      expect(conv!.unreadCount).toBe(0);
    });

    it("breaks timestamp ties deterministically without dropping or duplicating the conversation", async () => {
      const result = await getUserConversations(alice.id);
      const matches = result.filter((c) => c.partner.id === tieBreakPartner.id);
      expect(matches.length).toBe(1);
      expect(matches[0].lastMessage.id).toBe(tieBreakLatestId);
    });

    it("computes correct unread counts per partner", async () => {
      const result = await getUserConversations(alice.id);
      expectedUnreadCount.forEach((expectedUnread, partnerId) => {
        const conv = result.find((c) => c.partner.id === partnerId);
        expect(conv, `missing conversation for partner ${partnerId}`).toBeDefined();
        expect(conv!.unreadCount, `wrong unread count for partner ${partnerId}`).toBe(
          expectedUnread
        );
      });
    });

    it("orders conversations by most recent activity, descending", async () => {
      const result = await getUserConversations(alice.id);
      const timestamps = result.map((c) => new Date(c.lastMessage.createdAt).getTime());
      const sorted = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(sorted);
    });

    it("returns an empty array for a user with no messages at all", async () => {
      const lonely = await createUser("lonely");
      const result = await getUserConversations(lonely.id);
      expect(result).toEqual([]);
    });
  }
);
