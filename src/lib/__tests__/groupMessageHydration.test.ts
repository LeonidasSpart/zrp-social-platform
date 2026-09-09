import { describe, it, expect } from "vitest";
import { hydrateGroupSocketMessage, type GroupParticipantLite } from "@/lib/groupMessageHydration";

const alice: GroupParticipantLite = {
  id: "u-alice",
  username: "alice",
  name: "Alice A",
  avatarUrl: "https://example.com/alice.png",
  badgeType: "verified",
};

const bob: GroupParticipantLite = {
  id: "u-bob",
  username: "bob",
  name: null,
  avatarUrl: null,
  badgeType: null,
};

const participants = [alice, bob];

describe("hydrateGroupSocketMessage", () => {
  it("attaches the real sender profile for a current participant", () => {
    const result = hydrateGroupSocketMessage(
      {
        id: "m1",
        senderId: "u-alice",
        conversationId: "c1",
        content: "hey",
        createdAt: "2024-01-01T00:00:00Z",
      },
      participants
    );

    expect(result.sender).toEqual(alice);
    expect(result.id).toBe("m1");
    expect(result.content).toBe("hey");
  });

  it("falls back to a generic profile built from senderId for someone no longer in the group", () => {
    const result = hydrateGroupSocketMessage(
      {
        id: "m2",
        senderId: "u-departed",
        conversationId: "c1",
        content: "bye",
        createdAt: "2024-01-01T00:00:00Z",
      },
      participants
    );

    expect(result.sender).toEqual({
      id: "u-departed",
      username: "u-departed",
      name: null,
      avatarUrl: null,
      badgeType: null,
    });
  });

  it("never fabricates an imageUrl, reactions, or replyTo the socket payload never carried", () => {
    const result = hydrateGroupSocketMessage(
      { id: "m3", senderId: "u-bob", conversationId: "c1", content: "yo", createdAt: "2024-01-01T00:00:00Z" },
      participants
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reactions).toEqual([]);
    expect(result.replyTo).toBeNull();
  });
});
