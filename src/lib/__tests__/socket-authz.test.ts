import { describe, it, expect, vi } from "vitest";
// Plain require: socket-authz.js is CommonJS so server.js (a bare Node
// entrypoint) can load it; there is no TS declaration to import from.
const authz = require("../../../socket-authz.js");

// Unit coverage for the Socket.IO relay authorization in server.js:
// the relayed record and its target are derived from the database
// row, never from the client's payload, and call signaling is only
// relayed between the two parties of a call that was actually placed.

type Row = {
  id: string;
  senderId: string;
  receiverId: string | null;
  conversationId?: string | null;
  content?: string;
  imageUrl?: string | null;
  createdAt?: string;
  read?: boolean;
};

// members: conversationId -> userIds who are CURRENT ConversationParticipants
function fakePrisma(
  rows: Row[],
  reactions: Array<{ messageId: string; emoji: string }> = [],
  blocks: Array<[string, string]> = [],
  members: Record<string, string[]> = {}
) {
  return {
    message: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ senderId: string; receiverId: string }> } }) =>
        rows.find((r) => where.OR.some((c) => c.senderId === r.senderId && c.receiverId === r.receiverId)) ?? null
      ),
    },
    messageReaction: {
      findMany: vi.fn(async ({ where }: { where: { messageId: string } }) =>
        reactions.filter((r) => r.messageId === where.messageId)
      ),
    },
    blocked: {
      findFirst: vi.fn(async ({ where }: { where: { OR: Array<{ blockerId: string; blockedId: string }> } }) =>
        blocks.some(([a, b]) => where.OR.some((c) => c.blockerId === a && c.blockedId === b)) ? { id: "b" } : null
      ),
    },
    conversationParticipant: {
      findUnique: vi.fn(
        async ({ where }: { where: { conversationId_userId: { conversationId: string; userId: string } } }) => {
          const { conversationId, userId } = where.conversationId_userId;
          return (members[conversationId] ?? []).includes(userId) ? { id: `${conversationId}:${userId}` } : null;
        }
      ),
    },
  };
}

const rows: Row[] = [
  { id: "m1", senderId: "alice", receiverId: "bob", content: "hi bob" },
  { id: "m2", senderId: "carol", receiverId: "dave", content: "private" },
  // Group message: no receiver, lives in conversation g1 (members alice, bob, erin).
  { id: "g1m1", senderId: "erin", receiverId: null, conversationId: "g1", content: "hello group", imageUrl: null, createdAt: "2026-01-01T00:00:00.000Z", read: false },
];
const groupMembers = { g1: ["alice", "bob", "erin"] };

describe("send-message relay", () => {
  it("relays the stored row to its real receiver when the verified user is the sender", async () => {
    const r = await authz.authorizeSendRelay(fakePrisma(rows), "alice", { receiverId: "bob", messageId: "m1", content: "FORGED" });
    expect(r.ok).toBe(true);
    expect(r.targetId).toBe("bob");
    expect(r.message.content).toBe("hi bob");
  });

  it("refuses when the verified user is not the message's sender (spoofed messageId)", async () => {
    const r = await authz.authorizeSendRelay(fakePrisma(rows), "mallory", { receiverId: "dave", messageId: "m2" });
    expect(r.ok).toBe(false);
  });

  it("refuses when the claimed receiver differs from the stored one (misrouting)", async () => {
    const r = await authz.authorizeSendRelay(fakePrisma(rows), "alice", { receiverId: "dave", messageId: "m1" });
    expect(r.ok).toBe(false);
  });

  it("refuses an unknown message id and malformed payloads", async () => {
    expect((await authz.authorizeSendRelay(fakePrisma(rows), "alice", { receiverId: "bob", messageId: "nope" })).ok).toBe(false);
    expect((await authz.authorizeSendRelay(fakePrisma(rows), "alice", null)).ok).toBe(false);
    expect((await authz.authorizeSendRelay(fakePrisma(rows), "alice", { receiverId: 5, messageId: {} })).ok).toBe(false);
  });
});

describe("edit-message relay", () => {
  it("relays the stored (edited) row, ignoring the client's copy, to the stored receiver", async () => {
    const r = await authz.authorizeEditRelay(fakePrisma(rows), "alice", {
      receiverId: "dave", // wrong on purpose - must be ignored
      message: { id: "m1", content: "FORGED EDIT" },
    });
    expect(r.ok).toBe(true);
    expect(r.targetId).toBe("bob");
    expect(r.message.content).toBe("hi bob");
  });

  it("refuses an edit relay from anyone but the sender (ownership spoofing)", async () => {
    expect((await authz.authorizeEditRelay(fakePrisma(rows), "bob", { message: { id: "m1" } })).ok).toBe(false);
    expect((await authz.authorizeEditRelay(fakePrisma(rows), "mallory", { message: { id: "m2" } })).ok).toBe(false);
  });
});

describe("message-reaction relay", () => {
  it("loads reactions from the DB and targets the OTHER participant", async () => {
    const prisma = fakePrisma(rows, [{ messageId: "m1", emoji: "👍" }]);
    const asReceiver = await authz.authorizeReactionRelay(prisma, "bob", { messageId: "m1", reactions: [{ emoji: "FORGED" }], receiverId: "carol" });
    expect(asReceiver.ok).toBe(true);
    expect(asReceiver.targetId).toBe("alice");
    expect(asReceiver.reactions).toEqual([{ messageId: "m1", emoji: "👍" }]);

    const asSender = await authz.authorizeReactionRelay(prisma, "alice", { messageId: "m1" });
    expect(asSender.targetId).toBe("bob");
  });

  it("refuses a non-participant (conversation membership bypass)", async () => {
    expect((await authz.authorizeReactionRelay(fakePrisma(rows), "mallory", { messageId: "m1" })).ok).toBe(false);
  });
});

describe("delete-message relay", () => {
  it("relays only into a conversation the verified user actually has", async () => {
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows), "alice", { messageId: "gone", receiverId: "bob" })).ok).toBe(true);
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows), "bob", { messageId: "gone", receiverId: "alice" })).ok).toBe(true);
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows), "mallory", { messageId: "gone", receiverId: "bob" })).ok).toBe(false);
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows), "alice", { messageId: "gone", receiverId: "alice" })).ok).toBe(false);
  });

  it("refuses to relay a deletion for a message that still exists", async () => {
    // m1 (alice -> bob) was never deleted: bob must not be able to make
    // alice's open chat drop it.
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows), "bob", { messageId: "m1", receiverId: "alice" })).ok).toBe(false);
    expect((await authz.authorizeDeleteRelay(fakePrisma(rows, [], [], groupMembers), "alice", { messageId: "g1m1", conversationId: "g1" })).ok).toBe(false);
  });
});

describe("group conversations (send-group-message / edit / reaction / delete with conversationId)", () => {
  const prisma = () => fakePrisma(rows, [{ messageId: "g1m1", emoji: "🔥" }], [], groupMembers);

  it("send-group-message relays the STORED row into the group room only for the sender who is still a member", async () => {
    const r = await authz.authorizeGroupSendRelay(prisma(), "erin", { conversationId: "g1", messageId: "g1m1", content: "FORGED" });
    expect(r.ok).toBe(true);
    expect(r.targetId).toBe("group:g1");
    expect(r.message.content).toBe("hello group");
    expect(r.message.conversationId).toBe("g1");
  });

  it("send-group-message refuses a non-sender, a wrong conversation, and a member who has been removed", async () => {
    expect((await authz.authorizeGroupSendRelay(prisma(), "alice", { conversationId: "g1", messageId: "g1m1" })).ok).toBe(false);
    expect((await authz.authorizeGroupSendRelay(prisma(), "erin", { conversationId: "g2", messageId: "g1m1" })).ok).toBe(false);
    const removed = fakePrisma(rows, [], [], { g1: ["alice", "bob"] }); // erin no longer a participant
    expect((await authz.authorizeGroupSendRelay(removed, "erin", { conversationId: "g1", messageId: "g1m1" })).ok).toBe(false);
  });

  it("edit-message on a group message targets the group room from the row, ignoring any payload conversationId", async () => {
    const r = await authz.authorizeEditRelay(prisma(), "erin", { conversationId: "g-evil", message: { id: "g1m1", content: "FORGED" } });
    expect(r.ok).toBe(true);
    expect(r.targetId).toBe("group:g1");
    expect(r.message.content).toBe("hello group");
    expect((await authz.authorizeEditRelay(prisma(), "alice", { message: { id: "g1m1" } })).ok).toBe(false);
  });

  it("message-reaction on a group message requires current membership and targets the group room", async () => {
    const asMember = await authz.authorizeReactionRelay(prisma(), "bob", { messageId: "g1m1", conversationId: "g-evil", reactions: ["FORGED"] });
    expect(asMember.ok).toBe(true);
    expect(asMember.targetId).toBe("group:g1");
    expect(asMember.reactions).toEqual([{ messageId: "g1m1", emoji: "🔥" }]);
    expect((await authz.authorizeReactionRelay(prisma(), "mallory", { messageId: "g1m1" })).ok).toBe(false);
  });

  it("delete-message with a conversationId is relayed only for a current member (room abuse)", async () => {
    const ok = await authz.authorizeDeleteRelay(prisma(), "alice", { messageId: "gone", conversationId: "g1" });
    expect(ok.ok).toBe(true);
    expect(ok.targetId).toBe("group:g1");
    expect((await authz.authorizeDeleteRelay(prisma(), "mallory", { messageId: "gone", conversationId: "g1" })).ok).toBe(false);
    expect((await authz.authorizeDeleteRelay(prisma(), "alice", { messageId: "gone", conversationId: "g-nope" })).ok).toBe(false);
  });

  it("isConversationMember / groupRoom", async () => {
    expect(await authz.isConversationMember(prisma(), "alice", "g1")).toBe(true);
    expect(await authz.isConversationMember(prisma(), "mallory", "g1")).toBe(false);
    expect(authz.groupRoom("g1")).toBe("group:g1");
  });
});

describe("isBlockedEitherWay", () => {
  it("detects a block in either direction", async () => {
    const prisma = fakePrisma(rows, [], [["bob", "alice"]]);
    expect(await authz.isBlockedEitherWay(prisma, "alice", "bob")).toBe(true);
    expect(await authz.isBlockedEitherWay(prisma, "bob", "alice")).toBe(true);
    expect(await authz.isBlockedEitherWay(prisma, "alice", "carol")).toBe(false);
  });
});

describe("call registry (call signaling spoofing)", () => {
  it("accept/reject/end are refused when no call was placed", () => {
    const calls = authz.createCallRegistry();
    expect(calls.accept("bob", "alice")).toBe(false);
    expect(calls.reject("bob", "alice")).toBe(false);
    expect(calls.end("bob", "alice")).toBe(false);
  });

  it("only the callee can accept, only for the real caller", () => {
    const calls = authz.createCallRegistry();
    calls.start("alice", "bob");
    expect(calls.accept("alice", "bob")).toBe(false); // caller can't "accept" own call
    expect(calls.accept("mallory", "alice")).toBe(false); // third party
    expect(calls.accept("bob", "alice")).toBe(true);
    expect(calls.accept("bob", "alice")).toBe(false); // already active, not pending
  });

  it("either party can end an active call; a third party cannot", () => {
    const calls = authz.createCallRegistry();
    calls.start("alice", "bob");
    calls.accept("bob", "alice");
    expect(calls.end("mallory", "alice")).toBe(false);
    expect(calls.end("alice", "bob")).toBe(true);
    expect(calls.end("bob", "alice")).toBe(false); // already gone
  });

  it("reject only works on a pending call by the callee", () => {
    const calls = authz.createCallRegistry();
    calls.start("alice", "bob");
    expect(calls.reject("alice", "bob")).toBe(false);
    expect(calls.reject("bob", "alice")).toBe(true);
    expect(calls.size()).toBe(0);
  });

  it("a pending call expires, and dropUser forgets a user's calls", () => {
    const calls = authz.createCallRegistry({ pendingTtlMs: -1 });
    calls.start("alice", "bob");
    expect(calls.accept("bob", "alice")).toBe(false);

    const live = authz.createCallRegistry();
    live.start("alice", "bob");
    live.start("carol", "dave");
    live.dropUser("alice");
    expect(live.size()).toBe(1);
    expect(live.accept("dave", "carol")).toBe(true);
  });

  describe("generation race: a delayed end() for an old call must not delete a new one", () => {
    it("start() returns a distinct callId per call between the same two users", () => {
      const calls = authz.createCallRegistry();
      const id1 = calls.start("alice", "bob");
      calls.end("alice", "bob", id1);
      const id2 = calls.start("alice", "bob");
      expect(id1).toEqual(expect.any(String));
      expect(id2).toEqual(expect.any(String));
      expect(id1).not.toBe(id2);
    });

    it("REGRESSION: a stale end() carrying the OLD callId must not delete a call placed after it (proves the fix - see git history for the pre-fix behavior)", () => {
      const calls = authz.createCallRegistry();
      const staleCallId = calls.start("alice", "bob");
      calls.end("alice", "bob", staleCallId); // call 1 finishes normally

      const currentCallId = calls.start("alice", "bob"); // call 2 begins
      // A network-delayed end-call from call 1 arrives late, after call 2
      // has already started between the exact same two users.
      expect(calls.end("alice", "bob", staleCallId)).toBe(false);
      // Call 2 must still be fully intact and acceptable.
      expect(calls.accept("bob", "alice", currentCallId)).toBe(true);
    });

    it("end() with the CURRENT callId still works normally", () => {
      const calls = authz.createCallRegistry();
      const callId = calls.start("alice", "bob");
      expect(calls.end("alice", "bob", callId)).toBe(true);
      expect(calls.size()).toBe(0);
    });

    it("accept()/reject() also reject a stale callId for a call that has since been replaced", () => {
      const calls = authz.createCallRegistry();
      const staleCallId = calls.start("alice", "bob");
      calls.end("alice", "bob", staleCallId);
      calls.start("alice", "bob"); // new call, new generation

      expect(calls.accept("bob", "alice", staleCallId)).toBe(false);
      expect(calls.reject("bob", "alice", staleCallId)).toBe(false);
    });

    it("backward compatible: end()/accept()/reject() with NO callId behave exactly as before (unpatched client)", () => {
      const calls = authz.createCallRegistry();
      calls.start("alice", "bob");
      expect(calls.accept("bob", "alice")).toBe(true);
      expect(calls.end("alice", "bob")).toBe(true);
    });
  });
});
