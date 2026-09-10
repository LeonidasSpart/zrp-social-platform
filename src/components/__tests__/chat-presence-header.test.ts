import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Conversation header presence row.
 *
 * The dot and its label were misaligned and, below 640px, not rendered
 * at all: the row carried `hidden sm:flex`, inherited from the original
 * socketConnected-based indicator (#97) that only ever reflected the
 * viewer's own connection. Hiding a misleading dot on small screens was
 * reasonable; hiding the real one is not, and a phone is where knowing
 * whether the other person is here matters most.
 *
 * vitest runs environment: "node" here, so there is no DOM - these are
 * source guards. The geometry was measured in a real browser with two
 * live sessions: dot and label centres 0.00px apart at 320/390/430/820/
 * 1280, an 8x8 circle, a 6px gap, and an identical 38px header height in
 * both the Live and Offline states.
 */

const src = fs.readFileSync(
  path.join(process.cwd(), "src/components/ChatInterface.tsx"),
  "utf8",
);

// Comments are stripped first: the prose above this row explains the
// same words the assertions look for ("hidden", "Offline"), and the
// attribute itself is mentioned there before it is used.
const code = src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const statusRow = (() => {
  const i = code.indexOf('role="status"');
  expect(i).toBeGreaterThan(-1);
  return code.slice(i, i + 1400);
})();

// The row container's own class list, which is what decides whether it
// renders at all on a phone.
const rowClasses = (() => {
  const m = statusRow.match(/className="([^"]*)"/);
  expect(m).not.toBeNull();
  return m![1];
})();

describe("presence status row", () => {
  it("renders at every width, not only from sm up", () => {
    // The bug: invisible on mobile PWA and small Android phones.
    // Tokenised, because aria-hidden legitimately contains "hidden".
    const tokens = rowClasses.split(/\s+/);
    expect(tokens).not.toContain("hidden");
    expect(tokens).not.toContain("sm:flex");
    expect(tokens).toContain("flex");
  });

  it("centres the dot against the label deterministically", () => {
    expect(rowClasses.split(/\s+/)).toContain("items-center");
    // items-center puts the 8px dot on the text's cross-axis centre;
    // leading-4 pins that text box to 16px so the result does not drift
    // with inherited line-height or OS font scaling.
    expect(statusRow).toContain("items-center");
    expect(statusRow).toContain("leading-4");
  });

  it("keeps the dot a circle under pressure", () => {
    // A flex item shrinks by default: without shrink-0 a long translated
    // label in a narrow header squashes the circle into an ellipse.
    expect(statusRow).toMatch(/h-2 w-2 shrink-0 rounded-full/);
  });

  it("holds one consistent gap between dot and label", () => {
    expect(rowClasses.split(/\s+/)).toContain("gap-1.5");
  });

  it("survives a long display name without pushing the row", () => {
    expect(statusRow).toContain("min-w-0");
    expect(statusRow).toContain("truncate");
  });

  it("never carries presence by colour alone", () => {
    // The label states it in words; the dot is decoration and is hidden
    // from assistive tech so it is not announced twice.
    expect(statusRow).toContain('aria-hidden="true"');
    expect(statusRow).toContain("chat.live");
    expect(statusRow).toContain("chat.offline");
  });
});

describe("presence source", () => {
  it("still reads real per-partner presence, not this device's socket", () => {
    // Guard against a regression to the #97 behaviour, where the dot
    // showed the viewer's own connection state as the partner's.
    expect(src).toContain("isPartnerOnline(receiverId)");
    expect(src).toContain("hasStatus(receiverId)");
  });
});

/**
 * The same presence dot, in the two list views.
 *
 * Reported from an iPad: the dot on a conversation-list avatar rendered
 * as a green crescent rather than a circle. It sat inside the avatar's
 * own `rounded-full overflow-hidden` box, positioned at that box's
 * bottom-right corner - which is the point furthest OUTSIDE a circular
 * mask, so the circle sliced the dot and its contrasting ring away.
 *
 * The fix splits one box into two: the inner one still crops the avatar
 * image into a circle, the outer one is unclipped and carries the dot.
 * Measured after the change at iPad-portrait width in dark mode: a full
 * 12x12 box, border-radius 9999px, and the nearest clipping ancestor is
 * the rectangular scroll container, which does not cut it.
 */
describe("presence dot on list avatars is not clipped by the avatar mask", () => {
  const files = [
    "src/app/messages/page.tsx",
    "src/app/messages/layout.tsx",
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");

    it(`${file} does not put the dot inside the circular mask`, () => {
      const dotIdx = source.indexOf("bg-green-500");
      expect(dotIdx).toBeGreaterThan(-1);

      // The element that positions the dot is the nearest `relative`
      // wrapper above it. It must not be the one doing the clipping.
      const before = source.slice(0, dotIdx);
      const wrapperIdx = before.lastIndexOf('className="relative');
      expect(wrapperIdx).toBeGreaterThan(-1);
      const wrapper = before.slice(wrapperIdx, before.indexOf('"', wrapperIdx + 12) + 1);

      expect(wrapper).not.toContain("overflow-hidden");
      expect(wrapper).not.toContain("rounded-full");
    });

    it(`${file} still crops the avatar image to a circle`, () => {
      // The mask has to survive - it is what makes the avatar round.
      expect(source).toMatch(/rounded-full[^"]*overflow-hidden|overflow-hidden[^"]*rounded-full/);
    });
  }
});
