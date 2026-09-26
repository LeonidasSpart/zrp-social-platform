import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "I can't copy text from a message" + cramped phone composer.
 *
 * Source guards (vitest runs in the node environment here, matching
 * chat-presence-header.test.ts / message-delete-confirmation.test.ts):
 *
 *  1. Every message row used to carry `cursor-pointer` and an
 *     unconditional onClick that toggled the action bar. The click that
 *     ends a drag-select (or a long-press selection on mobile) is that
 *     same event, so copying text always also popped the toolbar, and
 *     the pointer cursor told the user the text wasn't selectable. The
 *     bubble now opts in to selection explicitly (`select-text`, which
 *     also emits the -webkit- prefix WebKit needs) and the row's toggle
 *     yields to a live selection.
 *  2. The phone-width composer squeezed six 40px icon buttons plus the
 *     send button into a 375px row, leaving the textarea ~135px (~90px
 *     at 320px), and hid the document and video buttons entirely below
 *     sm:. Those now live behind one "+" attachment sheet on phones,
 *     while sm:+ keeps the full inline row. Every input ref (camera,
 *     gallery, video, document) and the GIF picker stay wired.
 */
const root = process.cwd();

function stripComments(src: string): string {
  return src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const files = [
  ["ChatInterface.tsx (1:1)", "src/components/ChatInterface.tsx"],
  ["GroupChatInterface.tsx (group)", "src/components/GroupChatInterface.tsx"],
] as const;

describe.each(files)("%s - message text is selectable", (_label, rel) => {
  const src = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

  it("never disables selection on message content", () => {
    expect(src).not.toMatch(/select-none/);
    expect(src).not.toMatch(/userSelect\s*:\s*["']none/);
    expect(src).not.toMatch(/onContextMenu/);
  });

  it("opts the bubble in to text selection explicitly", () => {
    // The bubble container: `relative min-w-0 select-text rounded-2xl`
    // (whitespace-insensitive: 1:1 is formatted one class per line).
    expect(src).toMatch(/relative\s+min-w-0\s+select-text\s+rounded-2xl/);
  });

  it("the message row no longer advertises itself as a button with cursor-pointer", () => {
    const rowClass = src.match(/group\/message\s+flex\s+w-full[^`]*/);
    expect(rowClass).not.toBeNull();
    expect(rowClass![0]).not.toContain("cursor-pointer");
  });

  it("the row's tap-to-toggle yields to a live text selection", () => {
    expect(src).toContain("function hasTextSelection()");
    expect(src).toMatch(/onClick=\{\(\) => \{\s*if \(hasTextSelection\(\)\) return;/);
    expect(src).toContain("selection.isCollapsed");
  });
});

describe.each(files)("%s - phone composer keeps every attachment capability", (_label, rel) => {
  const src = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

  it("has a single phone-only attachment entry point", () => {
    expect(src).toContain("setShowAttachSheet(true)");
    expect(src).toContain('aria-label={t("chat.attachMenu")}');
  });

  it("the attachment sheet reaches camera, gallery, video, document and GIF", () => {
    const sheetStart = src.indexOf("{showAttachSheet && (");
    expect(sheetStart).toBeGreaterThan(-1);
    const sheet = src.slice(sheetStart, sheetStart + 5000);
    for (const ref of ["cameraInputRef", "fileInputRef", "videoInputRef", "documentInputRef"]) {
      expect(sheet).toContain(`${ref}.current?.click()`);
    }
    expect(sheet).toContain("setShowGifPicker(true)");
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the hidden file inputs mounted for the sheet to trigger", () => {
    for (const ref of ["cameraInputRef", "fileInputRef", "videoInputRef", "documentInputRef"]) {
      expect(src).toContain(`ref={${ref}}`);
    }
  });

  it("does not pile the inline media buttons into the phone row", () => {
    // The GIF/camera/gallery buttons in the composer row are sm:+ only.
    const rowStart = src.indexOf("setShowAttachSheet(true)");
    const rowEnd = src.indexOf("<textarea", rowStart);
    const row = src.slice(rowStart, rowEnd);
    const hiddenBelowSm = (row.match(/\bhidden\b[\s\S]*?\bsm:flex\b/g) || []).length;
    // camera, gallery, document, video, gif
    expect(hiddenBelowSm).toBe(5);
  });
});
