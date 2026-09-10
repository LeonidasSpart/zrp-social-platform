import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guards for two Admin dashboard bugs.
 *
 * Bug 1 - Admin > Posts threw the administrator out of the dashboard.
 *   Each row in the list was a <Link href={`/post/${id}`} target="_blank">,
 *   so clicking a post to moderate it opened the PUBLIC post page in a new
 *   browser tab. The admin context - the section, the search, the page of
 *   results being worked through - was gone, and there was no way back
 *   other than returning to the old tab. Posts now open in place, inside
 *   the admin layout, with a Back control that restores the untouched list.
 *
 * Bug 2 - Admin > Users lost the keyboard after every character.
 *   fetchUsers() calls setLoading(true), the effect refetches on every
 *   change of `search`, and the component then did
 *   `if (loading) return <spinner/>`. An early return like that replaces
 *   the whole tree, so React UNMOUNTED the <input> on each keystroke and
 *   mounted a fresh one when the response came back. A brand new input has
 *   no focus, and an unfocused input closes the on-screen keyboard on iOS
 *   and Android. The fix is structural - keep the shell mounted and move
 *   the loading state into the results region - NOT autoFocus and not
 *   imperative .focus() calls, both of which fight the symptom and break
 *   the caret.
 *
 * vitest runs with environment: "node" (see vitest.config.ts) so there is
 * no DOM to mount into; these assert on the source, matching the existing
 * pattern in src/components/__tests__/poll-render-regressions.test.ts.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Both files carry long explanatory comments about the very bugs being
 * guarded here, and those comments contain the exact strings under test
 * (`target="_blank"`, `if (loading) return`). Assert on code only.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const POSTS = "src/app/admin/posts/page.tsx";
const USERS = "src/app/admin/users/page.tsx";
const NEWS = "src/app/admin/news/page.tsx";

/**
 * An early `return` at the top level of the component body, before the
 * JSX that owns the search input, is the shape that unmounts the input.
 * A conditional INSIDE the returned JSX is fine - that is a re-render.
 */
const hasLoadingEarlyReturn = (src: string) =>
  /^\s{0,4}if\s*\(\s*loading\s*\)\s*(\{[\s\S]{0,40})?return/m.test(stripComments(src));

describe("Admin > Posts opens a post inside the admin context", () => {
  const src = read(POSTS);
  const code = stripComments(src);

  it("does not make the post row a link to the public post page", () => {
    expect(code).not.toMatch(/<Link[^>]*href=\{`\/post\/\$\{post\.id\}`\}/);
  });

  it("opens the post in place via component state instead", () => {
    expect(code).toContain("const [selectedPost, setSelectedPost] = useState<Post | null>(null)");
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*setSelectedPost\(post\)\}/);
  });

  it("renders the detail view inside the admin layout, not a route change", () => {
    expect(code).toMatch(/if\s*\(selectedPost\)\s*\{/);
    // No router.push/replace anywhere: leaving the /admin/posts route is
    // exactly what lost the admin context in the first place.
    expect(code).not.toMatch(/router\.(push|replace)\(/);
  });

  it("offers a Back control that clears the selection without refetching", () => {
    expect(code).toMatch(/onClick=\{\(\)\s*=>\s*setSelectedPost\(null\)\}/);
    expect(code).toContain("<ArrowLeft");
    // Back must not re-run the query - the list, the search term and the
    // page number are all still in state and have to come back as they
    // were. The handler is a bare setter (asserted above), so the only
    // other way a refetch could sneak in is an effect keyed on the
    // selection.
    const effects = code.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\)/g) || [];
    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) {
      const deps = effect.slice(effect.lastIndexOf("["));
      expect(deps).not.toContain("selectedPost");
    }
  });

  it("keeps the public post page reachable, but only as an explicit action", () => {
    // One deliberate "View Post" link in the detail view, never on the row.
    const blankLinks = code.match(/target="_blank"/g) || [];
    expect(blankLinks).toHaveLength(1);
    const idx = code.indexOf('target="_blank"');
    const block = code.slice(Math.max(0, idx - 300), idx + 300);
    expect(block).toContain("selectedPost.id");
    expect(block).toContain('rel="noopener noreferrer"');
  });

  it("does not unmount the search input while results load", () => {
    expect(hasLoadingEarlyReturn(src)).toBe(false);
  });
});

describe("Admin > Users search survives continuous typing", () => {
  const src = read(USERS);
  const code = stripComments(src);

  it("has no whole-tree loading return that would unmount the input", () => {
    expect(hasLoadingEarlyReturn(src)).toBe(false);
  });

  it("renders the loading state inside the results table instead", () => {
    const tbody = code.indexOf("<tbody");
    expect(tbody).toBeGreaterThan(-1);
    const body = code.slice(tbody, code.indexOf("</tbody>"));
    expect(body).toMatch(/\{loading \?/);
    expect(body).toContain('role="status"');
  });

  it("keeps the search input above the loading boundary", () => {
    const input = code.indexOf("value={search}");
    const tbody = code.indexOf("<tbody");
    expect(input).toBeGreaterThan(-1);
    expect(input).toBeLessThan(tbody);
  });

  it("keeps search live - the fix must not be to stop searching as you type", () => {
    expect(code).toMatch(/onChange=\{\(e\)\s*=>\s*\{?\s*setSearch\(e\.target\.value\)/);
    expect(code).toMatch(/useEffect\([\s\S]{0,200}?\[[^\]]*search[^\]]*\]\)/);
  });

  it("does not paper over the remount with autoFocus or imperative focus()", () => {
    // Both are the symptomatic "fix": they either steal focus on load or
    // fight the caret position on every re-render, and neither addresses
    // the input being destroyed.
    const inputIdx = code.indexOf("value={search}");
    const inputBlock = code.slice(Math.max(0, inputIdx - 500), inputIdx + 500);
    expect(inputBlock).not.toContain("autoFocus");
    expect(code).not.toMatch(/\.current\?\.focus\(\)/);
    expect(code).not.toMatch(/\.focus\(\)/);
  });
});

describe("Admin > News was already correct and stays that way", () => {
  const code = stripComments(read(NEWS));

  it("edits an article in place rather than navigating away", () => {
    expect(code).toMatch(/openEdit/);
    expect(code).not.toMatch(/router\.push\(`\/news\//);
  });

  it("does not unmount its shell while loading", () => {
    expect(hasLoadingEarlyReturn(read(NEWS))).toBe(false);
  });
});
