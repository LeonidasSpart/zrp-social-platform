// Decides WHICH shape a conversation-list row's last-message preview
// takes - a direct 1:1 preview never names the sender (there's only one
// other person), while a group preview must, since a group has more
// than one possible sender and "hey" with no attribution is ambiguous
// about who said it. Pure so the branching (own vs. other, direct vs.
// group, empty content) can be unit-tested without mounting either
// messages/page.tsx or messages/layout.tsx.
export type MessagePreview =
  | { kind: "own"; content: string }
  | { kind: "plain"; content: string }
  | { kind: "fromSender"; senderName: string; content: string };

export function buildMessagePreview(opts: {
  isGroup: boolean;
  isOwnMessage: boolean;
  senderName: string;
  content: string;
}): MessagePreview {
  const content = opts.content ?? "";

  if (opts.isOwnMessage) {
    return { kind: "own", content };
  }
  if (opts.isGroup) {
    return { kind: "fromSender", senderName: opts.senderName, content };
  }
  return { kind: "plain", content };
}
