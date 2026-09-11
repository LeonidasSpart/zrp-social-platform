import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "Delete conversation" (delete a whole 1:1 thread at once, not just a
 * single message). The backend route already existed
 * (src/app/api/messages/conversation/[userId]/route.ts) but had no UI
 * ever calling it and no test coverage - this file guards the new
 * frontend wiring: the contact-drawer menu action, the in-app confirm
 * modal (not window.confirm(), per the same iOS-PWA/Capacitor-WebView
 * unreliability documented in message-delete-confirmation.test.ts), the
 * realtime "delete-conversation" socket relay, and navigation away from
 * the now-empty thread.
 *
 * vitest runs environment: "node" here (no DOM), matching this repo's
 * existing convention for frontend regressions (see
 * chat-presence-header.test.ts / message-delete-confirmation.test.ts) -
 * these are source guards, not rendered component tests.
 */
const root = process.cwd();

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const drawerSrcRaw = fs.readFileSync(path.join(root, "src/components/ChatContactDrawer.tsx"), "utf8");
const chatSrcRaw = fs.readFileSync(path.join(root, "src/components/ChatInterface.tsx"), "utf8");

describe("ChatContactDrawer - delete conversation", () => {
  const src = stripComments(drawerSrcRaw);

  const deleteFlowSrc = (() => {
    const start = src.indexOf("const confirmDeleteConversation");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n  };", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  })();

  it("never calls window.confirm() to gate the deletion", () => {
    expect(deleteFlowSrc).not.toMatch(/[^a-zA-Z.]confirm\(/);
  });

  it("imports and renders the in-app ConfirmModal, not a native dialog", () => {
    expect(src).toContain('import ConfirmModal from "@/components/ConfirmModal"');
    expect(src).toContain("<ConfirmModal");
  });

  it("exposes a 'Delete conversation' action in the more-menu, separate from Block", () => {
    expect(src).toContain("chat.deleteConversation");
    expect(src).toMatch(/setPendingDeleteConversation\(true\)/);
    // It's a distinct button from handleBlock, not a repurposed one.
    const blockIdx = src.indexOf("onClick={handleBlock}");
    const deleteIdx = src.indexOf("setPendingDeleteConversation(true)");
    expect(blockIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(blockIdx);
  });

  it("opens the modal first (does not delete directly) from the menu button", () => {
    // Clicking the menu item only flips pending state; the network call
    // lives solely in confirmDeleteConversation, invoked by the modal.
    const buttonStart = src.indexOf("setPendingDeleteConversation(true)");
    const buttonBlockEnd = src.indexOf("</button>", buttonStart);
    const buttonSrc = src.slice(buttonStart - 120, buttonBlockEnd);
    expect(buttonSrc).not.toContain("fetch(");
  });

  it("calls the authoritative DELETE conversation API from the confirm handler", () => {
    expect(deleteFlowSrc).toContain("/api/messages/conversation/${receiverId}");
    expect(deleteFlowSrc).toContain('method: "DELETE"');
  });

  it("only tells the caller the conversation is gone after the API call succeeds", () => {
    expect(deleteFlowSrc).toMatch(/if \(res\.ok\) \{[\s\S]*onConversationDeleted\?\.\(\)/);
  });

  it("shows delete errors as in-app UI, not a native alert", () => {
    expect(src).not.toMatch(/[^a-zA-Z.]alert\(/);
    expect(src).toContain("setDeleteConversationError(");
    expect(src).toMatch(/role="alert"[\s\S]{0,40}aria-live="polite"/);
  });

  it("auto-clears the error banner instead of leaving it stuck forever", () => {
    expect(src).toMatch(/setTimeout\(\(\) => setDeleteConversationError\(null\), 4000\)/);
  });

  it("disables the modal's actions while the delete request is in flight", () => {
    expect(src).toMatch(/busy=\{deletingConversation\}/);
  });
});

describe("ChatInterface - reacts to a completed conversation deletion", () => {
  const src = stripComments(chatSrcRaw);

  const handlerSrc = (() => {
    const start = src.indexOf("const handleConversationDeleted");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n  };", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  })();

  it("passes the deletion callback into the contact drawer", () => {
    expect(src).toContain("onConversationDeleted={");
    expect(src).toContain("handleConversationDeleted");
  });

  it("clears local messages so nothing from the deleted thread lingers on screen", () => {
    expect(handlerSrc).toContain("setMessages([])");
  });

  it("relays the deletion over the socket so the other party's list updates live", () => {
    expect(handlerSrc).toContain("socketRef.current?.emit(");
    expect(handlerSrc).toContain('"delete-conversation"');
    expect(handlerSrc).toContain("otherUserId: receiverId");
  });

  it("navigates away from the now-empty thread", () => {
    expect(handlerSrc).toContain("router.push(");
    expect(handlerSrc).toContain('"/messages"');
  });
});

describe("useConversationList - realtime removal on the other party's side", () => {
  const src = stripComments(
    fs.readFileSync(path.join(root, "src/lib/useConversationList.ts"), "utf8")
  );

  it("listens for the conversation-deleted relay and drops that conversation from the list", () => {
    expect(src).toContain('socket.on("conversation-deleted"');
    expect(src).toMatch(/socket\.off\("conversation-deleted"/);
  });
});

describe("useConversationList - deleteConversation (list-level delete, no thread open)", () => {
  const src = stripComments(
    fs.readFileSync(path.join(root, "src/lib/useConversationList.ts"), "utf8")
  );

  const fnSrc = (() => {
    const start = src.indexOf("const deleteConversation = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n  );", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  })();

  it("calls the same authoritative DELETE conversation API ChatContactDrawer uses", () => {
    expect(fnSrc).toContain("/api/messages/conversation/${partnerId}");
    expect(fnSrc).toContain('method: "DELETE"');
  });

  it("only relays over the socket and updates local state after the API call succeeds", () => {
    expect(fnSrc).toMatch(/if \(res\.ok\) \{[\s\S]*"delete-conversation"[\s\S]*setConversations/);
  });

  it("relays the same delete-conversation socket event ChatInterface emits", () => {
    expect(fnSrc).toContain('.emit("delete-conversation", { otherUserId: partnerId })');
  });

  it("returns a success/error result instead of throwing, so the UI can show a real error", () => {
    expect(fnSrc).toContain("return { success: true }");
    expect(fnSrc).toContain("return { success: false");
  });

  it("is exposed from the hook for both messages/page.tsx and messages/layout.tsx to use", () => {
    expect(src).toMatch(/return \{ conversations, loading, refresh, deleteConversation \}/);
  });
});

describe("ConversationRowMenu - conversation-list delete action", () => {
  const src = stripComments(
    fs.readFileSync(path.join(root, "src/components/ConversationRowMenu.tsx"), "utf8")
  );

  it("never calls window.confirm()/alert() to gate or report the deletion", () => {
    expect(src).not.toMatch(/[^a-zA-Z.]confirm\(/);
    expect(src).not.toMatch(/[^a-zA-Z.]alert\(/);
  });

  it("imports and renders the in-app ConfirmModal, not a native dialog", () => {
    expect(src).toContain('import ConfirmModal from "@/components/ConfirmModal"');
    expect(src).toContain("<ConfirmModal");
  });

  it("opens the modal first (does not delete directly) from the menu item", () => {
    const buttonStart = src.indexOf("setConfirming(true)");
    const buttonBlockEnd = src.indexOf("</button>", buttonStart);
    const buttonSrc = src.slice(buttonStart - 200, buttonBlockEnd);
    expect(buttonSrc).not.toContain("onDelete(");
  });

  it("only calls onDelete from the confirm handler, invoked by the modal", () => {
    expect(src).toMatch(/const handleConfirm = async \(\) => \{[\s\S]*await onDelete\(\)/);
    expect(src).toContain("onConfirm={handleConfirm}");
  });

  it("uses the pre-existing, already-translated messages.* keys (not chat.* - that's the in-thread menu)", () => {
    expect(src).toContain('t("messages.deleteConversation")');
    expect(src).toContain('t("messages.deleteConfirm")');
    expect(src).toContain('t("messages.errDeleteFailed")');
  });

  it("stops the click from bubbling into the row's own Link (would otherwise navigate into the thread)", () => {
    expect(src).toMatch(/onClick=\{\(event\) => \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  });

  it("gives the icon-only trigger button a translated accessible label", () => {
    expect(src).toMatch(/<button[\s\S]{0,120}aria-label=\{t\(/);
  });

  it("shows delete errors as in-app UI, not a native alert, and auto-clears them", () => {
    expect(src).toContain("setError(");
    expect(src).toMatch(/role="alert"[\s\S]{0,40}aria-live="polite"/);
    expect(src).toMatch(/window\.setTimeout\(\(\) => setError\(null\), 4000\)/);
  });

  it("disables the modal's actions while the delete request is in flight", () => {
    expect(src).toMatch(/busy=\{busy\}/);
  });
});

describe("messages list screens - conversation-list delete is wired for direct conversations only", () => {
  const pageSrc = stripComments(fs.readFileSync(path.join(root, "src/app/messages/page.tsx"), "utf8"));
  const layoutSrc = stripComments(fs.readFileSync(path.join(root, "src/app/messages/layout.tsx"), "utf8"));

  for (const [name, src] of [
    ["messages/page.tsx (mobile list)", pageSrc],
    ["messages/layout.tsx (desktop sidebar)", layoutSrc],
  ] as const) {
    it(`${name} renders ConversationRowMenu for a direct row, wired to deleteConversation`, () => {
      expect(src).toContain('import ConversationRowMenu from "@/components/ConversationRowMenu"');
      expect(src).toContain("<ConversationRowMenu");
      expect(src).toMatch(/onDelete=\{\(\) => deleteConversation\(partner\.id\)\}/);
    });

    it(`${name} does not offer conversation deletion on a GROUP row (no such backend feature - see IMPORTANT DISTINCTION)`, () => {
      const menuIdx = src.indexOf("<ConversationRowMenu");
      // Every group row renders its member-count chip via group.memberCount
      // (buildMessagePreview's "fromSender" branch, or the plain fallback) -
      // present only in the group-row JSX, after the direct-row branch ends.
      const groupSectionIdx = src.indexOf('t("group.memberCount"');
      expect(menuIdx).toBeGreaterThan(-1);
      expect(groupSectionIdx).toBeGreaterThan(-1);
      // The one ConversationRowMenu usage appears before the group-row
      // section starts, i.e. only inside the direct-row branch.
      expect(menuIdx).toBeLessThan(groupSectionIdx);
      expect(src.indexOf("<ConversationRowMenu", menuIdx + 1)).toBe(-1);
    });
  }
});

describe("socket-authz - authorizeConversationDeleteRelay", () => {
  const src = stripComments(fs.readFileSync(path.join(root, "socket-authz.js"), "utf8"));

  it("rejects a missing/self-targeted otherUserId before ever touching the database", () => {
    const start = src.indexOf("async function authorizeConversationDeleteRelay");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n}", start);
    const fnSrc = src.slice(start, end);
    expect(fnSrc).toContain("if (otherUserId === userId) return { ok: false };");
    expect(fnSrc).toMatch(/isNonEmptyString\(otherUserId\)/);
  });

  it("is exported for server.js to use", () => {
    expect(src).toMatch(/module\.exports\s*=\s*\{[\s\S]*authorizeConversationDeleteRelay/);
  });
});

describe("server.js - delete-conversation relay", () => {
  const src = stripComments(fs.readFileSync(path.join(root, "server.js"), "utf8"));

  it("rate-limits the delete-conversation event", () => {
    expect(src).toMatch(/checkEventRateLimit\(userId, "delete-conversation", [\d_]+, [\d_]+\)/);
  });

  it("authorizes via the DB-backed helper before relaying, never trusting the raw payload", () => {
    const start = src.indexOf('socket.on("delete-conversation"');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("delete-conversation relay error", start);
    expect(end).toBeGreaterThan(start);
    const handlerSrc = src.slice(start, end);
    expect(handlerSrc).toContain("authorizeConversationDeleteRelay(prisma, userId, payload)");
    expect(handlerSrc).toContain("if (!relay.ok) return;");
    expect(handlerSrc).toContain('io.to(relay.targetId).emit("conversation-deleted"');
  });

  it("also tells the deleting user's own other sessions, not just the other party", () => {
    // The sidebar list (messages/layout.tsx desktop, messages/page.tsx
    // mobile) uses its own useConversationList() instance, separate from
    // the open thread's - without this, deleting a conversation clears
    // the open thread but leaves it listed as if still there.
    const start = src.indexOf('socket.on("delete-conversation"');
    const end = src.indexOf("delete-conversation relay error", start);
    const handlerSrc = src.slice(start, end);
    expect(handlerSrc).toContain('io.to(userId).emit("conversation-deleted", { withUserId: relay.targetId });');
  });
});
