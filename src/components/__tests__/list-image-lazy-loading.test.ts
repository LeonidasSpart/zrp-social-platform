import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Regression guard for a real media-loading bug found in a platform-wide
 * performance audit: several images rendered once PER ITEM inside a
 * scrollable list (comment author avatars, comment attachment images,
 * story-ring previews, the home page's creator row, and a post's
 * multi-image gallery grid) had no `loading="lazy"` attribute, unlike
 * sibling images in the same files that already had it (e.g. the
 * quote-post avatar/image and the single-image post view in
 * PostCard.tsx). Without it, the browser eagerly fetches every one of
 * these images as soon as they're in the DOM, regardless of scroll
 * position - for a feed/thread with many items, that's a real amount of
 * off-screen network traffic paid up front instead of only as the user
 * actually scrolls to it.
 *
 * This repo's vitest environment is "node" (no jsdom - see
 * useBodyScrollLock.test.ts's own comment), so this is a source-level
 * regression guard: it locks in that these specific per-item <img> tags
 * keep the loading="lazy" attribute, rather than re-testing browser
 * lazy-loading behavior itself (which the browser, not this app,
 * implements).
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("per-item images in scrollable lists are lazy-loaded", () => {
  it("PostCard's author avatar and multi-image gallery tiles are lazy", () => {
    const source = read("src/components/PostCard.tsx");
    // Author avatar (rendered once per post in the feed).
    expect(source).toMatch(
      /src=\{post\.author\.avatarUrl\}[\s\S]{0,300}loading="lazy"/
    );
    // Multi-image gallery grid tile (rendered once per image per post).
    expect(source).toMatch(/src=\{url\}[\s\S]{0,600}loading="lazy"/);
  });

  it("Comments.tsx's per-comment avatar is lazy", () => {
    const source = read("src/components/Comments.tsx");
    expect(source).toMatch(
      /src=\{getAvatarSrc\(comment\.author\)\}[\s\S]{0,300}loading="lazy"/
    );
  });

  it("CommentItem.tsx's per-comment avatar and attached image are lazy", () => {
    const source = read("src/components/CommentItem.tsx");
    expect(source).toMatch(
      /src=\{comment\.author\.avatarUrl\}[\s\S]{0,300}loading="lazy"/
    );
    expect(source).toMatch(
      /src=\{comment\.imageUrl\}[\s\S]{0,300}loading="lazy"/
    );
  });

  it("StoryCircle.tsx's per-user story preview/avatar are lazy", () => {
    const source = read("src/components/StoryCircle.tsx");
    expect(source).toMatch(
      /src=\{storyPreview\}[\s\S]{0,300}loading="lazy"/
    );
    expect(source).toMatch(
      /src=\{user\.avatarUrl\}[\s\S]{0,300}loading="lazy"/
    );
  });

  it("HomeCreatorsRow.tsx's per-creator avatar is lazy", () => {
    const source = read("src/components/HomeCreatorsRow.tsx");
    expect(source).toMatch(
      /src=\{user\.avatarUrl\}[\s\S]{0,300}loading="lazy"/
    );
  });
});
