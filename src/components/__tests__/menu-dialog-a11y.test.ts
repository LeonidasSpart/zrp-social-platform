import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { translations } from "@/lib/translations";

// Source-level regression tests (no jsdom/RTL in this project; see
// language-menu-scroll.test.ts) for the shared menu/dialog fixes:
// dialogs announced as dialogs and dismissable with Escape, the post
// "..."/repost menus closable by keyboard and outside click, RTL-safe
// flyout anchoring in the Sidebar, and post-action strings translated.

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

const DIALOGS = [
  "ReportModal.tsx",
  "EditPostModal.tsx",
  "QuotePostModal.tsx",
  "TipModal.tsx",
  "UpgradeRequestModal.tsx",
  "CryptoPaymentModal.tsx",
  "NativePaymentNotice.tsx",
  "StoryComposer.tsx",
  "CategoryPickerModal.tsx",
];

describe("shared modals", () => {
  it.each(DIALOGS)("%s is a labelled modal dialog wired to useDialogA11y", (file) => {
    const src = read(file);
    expect(src).toContain('from "@/hooks/useDialogA11y"');
    expect(src).toMatch(/useDialogA11y\(/);
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain("aria-labelledby={titleId}");
    expect(src).toContain("id={titleId}");
    expect(src).toContain("ref={dialogRef}");
  });

  it("modal close buttons are anchored to the inline end, not the physical right", () => {
    for (const file of ["NativePaymentNotice.tsx", "UpgradeRequestModal.tsx", "CryptoPaymentModal.tsx", "StoryComposer.tsx"]) {
      expect(read(file)).not.toMatch(/absolute top-3 right-3/);
    }
  });
});

describe("PostCard menus", () => {
  const src = read("PostCard.tsx");

  it("closes the more/repost menus on Escape and returns focus", () => {
    expect(src).toContain("ref={moreMenuButtonRef}");
    expect(src).toContain("ref={repostButtonRef}");
    expect(src).toMatch(/moreMenuButtonRef\.current\?\.focus\(\)/);
    expect(src).toMatch(/repostButtonRef\.current\?\.focus\(\)/);
  });

  it("repost dropdown has an outside-click backdrop and opens from the inline start", () => {
    const idx = src.indexOf("{repostDropdownOpen && (");
    const block = src.slice(idx, idx + 800);
    expect(block).toContain("onClick={() => setRepostDropdownOpen(false)}");
    expect(block).toContain("absolute start-0");
    expect(block).not.toContain("absolute left-0");
  });

  it("post actions no longer ship hardcoded English", () => {
    for (const literal of [
      "Undo Repost",
      "Reposted from",
      '"Failed to delete post"',
      '"Failed to update pin status"',
      '"Report submitted. Thank you',
      '"Unmute video"',
    ]) {
      expect(src).not.toContain(literal);
    }
  });
});

describe("Sidebar flyouts", () => {
  const src = read("Sidebar.tsx");

  it("anchor to the trigger's inline-start edge (RTL-safe)", () => {
    expect(src).toContain('document.documentElement.dir === "rtl"');
    expect(src).not.toMatch(/left: rect\.left, bottom/);
    expect(src).toContain("right: langMenuPos.right");
    expect(src).toContain("right: moreMenuPos.right");
  });
});

describe("new post-action translation keys", () => {
  it("exist, non-empty, in every language", () => {
    const keys = ["post.undoRepost", "post.repostedFrom", "post.errDeleteFailed", "post.errPinFailed"] as const;
    for (const [lang, dict] of Object.entries(translations)) {
      for (const key of keys) {
        expect(dict[key], `${lang}:${key}`).toBeTruthy();
      }
    }
  });
});
