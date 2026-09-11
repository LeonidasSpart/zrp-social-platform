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
    const end = src.indexOf("});", start);
    const handlerSrc = src.slice(start, end);
    expect(handlerSrc).toContain("authorizeConversationDeleteRelay(prisma, userId, payload)");
    expect(handlerSrc).toContain("if (!relay.ok) return;");
    expect(handlerSrc).toContain('io.to(relay.targetId).emit("conversation-deleted"');
  });
});
