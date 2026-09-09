import { describe, it, expect } from "vitest";
import { buildMessagePreview } from "@/lib/conversationPreview";

describe("buildMessagePreview", () => {
  it("uses 'own' for the current user's own message in a direct conversation", () => {
    expect(
      buildMessagePreview({ isGroup: false, isOwnMessage: true, senderName: "Me", content: "hi" })
    ).toEqual({ kind: "own", content: "hi" });
  });

  it("uses 'own' for the current user's own message in a group (never names them via fromSender)", () => {
    expect(
      buildMessagePreview({ isGroup: true, isOwnMessage: true, senderName: "Me", content: "hi" })
    ).toEqual({ kind: "own", content: "hi" });
  });

  it("uses 'plain' with no attribution for a direct conversation's other-party message", () => {
    expect(
      buildMessagePreview({ isGroup: false, isOwnMessage: false, senderName: "Alice", content: "hey" })
    ).toEqual({ kind: "plain", content: "hey" });
  });

  it("uses 'fromSender' with the sender's name for a group's other-member message", () => {
    expect(
      buildMessagePreview({ isGroup: true, isOwnMessage: false, senderName: "Alice", content: "hey" })
    ).toEqual({ kind: "fromSender", senderName: "Alice", content: "hey" });
  });

  it("passes through empty content rather than substituting a placeholder", () => {
    expect(
      buildMessagePreview({ isGroup: true, isOwnMessage: false, senderName: "Alice", content: "" })
    ).toEqual({ kind: "fromSender", senderName: "Alice", content: "" });
  });
});
