import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { sizeTextareaToContent } from "../useAutoGrowTextarea";

/*
 * Regression coverage for the comment-composer UX report: "users should
 * be able to clearly see the text they are entering... a larger or more
 * visible text box while typing." Every fixed composer (Comments.tsx's
 * new-comment/edit/reply textareas, CommentItem.tsx's edit textarea, and
 * the standalone post-detail page's composer, which used to be a
 * single-line <input>) shares this one auto-grow implementation instead
 * of each reimplementing its own inline resize logic.
 *
 * vitest runs environment: "node" project-wide (no jsdom - see
 * useBodyScrollLock.test.ts's own comment on why), so `sizeTextareaToContent`
 * is exercised directly against a minimal faked textarea element rather
 * than through a real DOM/render, and the hook/call-site wiring is
 * covered with source guards.
 */

function fakeTextarea(scrollHeight: number) {
  return {
    style: { height: "" },
    scrollHeight,
  } as unknown as HTMLTextAreaElement;
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("sizeTextareaToContent", () => {
  it("grows the textarea to fit its content up to the max height", () => {
    const el = fakeTextarea(120);
    sizeTextareaToContent(el, 208);
    expect(el.style.height).toBe("120px");
  });

  it("caps growth at maxHeightPx for long content", () => {
    const el = fakeTextarea(500);
    sizeTextareaToContent(el, 208);
    expect(el.style.height).toBe("208px");
  });

  it("resets to auto before measuring, so shrinking text actually shrinks the box", () => {
    // A textarea that briefly reports a stale (larger) scrollHeight if
    // height isn't reset first would never shrink back down as the user
    // deletes text - resetting to "auto" first is what makes scrollHeight
    // reflect the CURRENT content on every call.
    let heightAtMeasureTime = "";
    const el = {
      style: {
        set height(v: string) {
          heightAtMeasureTime = heightAtMeasureTime || v;
        },
        get height() {
          return "";
        },
      },
      scrollHeight: 40,
    } as unknown as HTMLTextAreaElement;
    sizeTextareaToContent(el, 208);
    expect(heightAtMeasureTime).toBe("auto");
  });

  it("is a no-op when the element is null (safe to call from a ref before mount)", () => {
    expect(() => sizeTextareaToContent(null)).not.toThrow();
  });

  it("defaults maxHeightPx when not provided", () => {
    const el = fakeTextarea(1000);
    sizeTextareaToContent(el);
    expect(el.style.height).toBe("208px");
  });
});

describe("useAutoGrowTextarea source wiring", () => {
  it("is a real hook (useLayoutEffect + useRef), safe only in components/hooks", () => {
    const source = read("src/hooks/useAutoGrowTextarea.ts");
    expect(source).toContain("useLayoutEffect");
    expect(source).toContain("useRef");
    expect(source).toContain("export function useAutoGrowTextarea");
    expect(source).toContain("export function sizeTextareaToContent");
  });
});

describe("comment composer call sites use the shared auto-grow logic", () => {
  it("Comments.tsx uses the hook for the top-level composer and the plain function for per-row textareas", () => {
    const source = read("src/components/Comments.tsx");
    expect(source).toContain("useAutoGrowTextarea, sizeTextareaToContent");
    expect(source).toContain("useAutoGrowTextarea(newComment)");
    expect(source).toContain("sizeTextareaToContent(el)");
  });

  it("CommentItem.tsx's edit textarea uses the hook", () => {
    const source = read("src/components/CommentItem.tsx");
    expect(source).toContain("useAutoGrowTextarea(editContent)");
    expect(source).toContain("ref={editContentRef}");
  });

  it("the post-detail page's composer is a multi-line textarea, not a single-line input", () => {
    const source = read("src/app/post/[id]/page.tsx");
    expect(source).toContain("useAutoGrowTextarea(commentContent)");
    expect(source).toContain("<textarea");
    expect(source).not.toMatch(/<input[^>]*type="text"[^>]*commentContent/);
  });

  it("composer textareas use text-base (16px) to avoid iOS Safari's auto-zoom-on-focus below 16px", () => {
    for (const file of [
      "src/components/Comments.tsx",
      "src/components/CommentItem.tsx",
      "src/app/post/[id]/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("text-base");
    }
  });
});
