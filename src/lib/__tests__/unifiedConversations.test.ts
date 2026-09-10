import { describe, it, expect } from "vitest";
import { buildUnifiedConversationList, type DirectConversationInput, type GroupConversationInput } from "@/lib/unifiedConversations";

function direct(id: string, username: string, createdAt: string, unreadCount = 0): DirectConversationInput {
  return {
    partner: { id, username, name: username, avatarUrl: null, badgeType: null },
    lastMessage: { id: `m-${id}`, content: "hi", createdAt, senderId: id },
    unreadCount,
  };
}

function group(id: string, createdAt: string | null, unreadCount = 0): GroupConversationInput {
  return {
    id,
    name: `Group ${id}`,
    avatarUrl: null,
    participantCount: 5,
    lastMessage: createdAt
      ? {
          id: `gm-${id}`,
          content: "hey",
          createdAt,
          senderId: "u1",
          sender: { id: "u1", username: "u1", name: "U1" },
        }
      : null,
    unreadCount,
  };
}

describe("buildUnifiedConversationList", () => {
  it("sorts direct and group conversations together by most recent activity", () => {
    const result = buildUnifiedConversationList(
      [direct("a", "alice", "2024-01-01T00:00:00Z"), direct("b", "bob", "2024-01-03T00:00:00Z")],
      [group("g1", "2024-01-02T00:00:00Z")]
    );

    expect(result.map((r) => r.key)).toEqual(["direct:b", "group:g1", "direct:a"]);
  });

  it("sorts a group with no messages yet as the oldest, not the newest", () => {
    const result = buildUnifiedConversationList(
      [direct("a", "alice", "2020-01-01T00:00:00Z")],
      [group("g1", null)]
    );

    expect(result.map((r) => r.key)).toEqual(["direct:a", "group:g1"]);
  });

  it("builds the exact group thread href the backend's own push notifications use", () => {
    const result = buildUnifiedConversationList([], [group("g1", "2024-01-01T00:00:00Z")]);
    expect(result[0].href).toBe("/messages/group/g1");
  });

  it("builds the direct thread href from the partner's username", () => {
    const result = buildUnifiedConversationList([direct("a", "alice", "2024-01-01T00:00:00Z")], []);
    expect(result[0].href).toBe("/messages/alice");
  });

  it("is a stable sort for equal timestamps", () => {
    const result = buildUnifiedConversationList(
      [direct("a", "alice", "2024-01-01T00:00:00Z"), direct("b", "bob", "2024-01-01T00:00:00Z")],
      []
    );
    expect(result.map((r) => r.key)).toEqual(["direct:a", "direct:b"]);
  });

  it("returns an empty list for no conversations of either kind", () => {
    expect(buildUnifiedConversationList([], [])).toEqual([]);
  });
});
