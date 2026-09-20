import { describe, it, expect } from "vitest";
import { computeKeyboardScrollAdjustment } from "../keyboardVisibility";

// Regression coverage for the Post Composer keyboard bug: attaching an
// image and continuing to type could grow the textarea past what an
// open mobile keyboard leaves visible, with nothing to scroll the newly
// typed text back into view. This is the arithmetic that fix relies on.
describe("computeKeyboardScrollAdjustment", () => {
  it("returns 0 when the element already fits inside the viewport", () => {
    expect(computeKeyboardScrollAdjustment(300, 508)).toBe(0);
  });

  it("returns 0 when the element's bottom exactly meets the viewport edge", () => {
    expect(computeKeyboardScrollAdjustment(508, 508)).toBe(0);
  });

  it("returns overflow + margin when the element extends past the viewport", () => {
    // The exact scenario reproduced: a grown textarea's bottom at y=380
    // against a keyboard-shrunk viewport of 376px tall.
    expect(computeKeyboardScrollAdjustment(380, 376)).toBe(4 + 16);
  });

  it("scales with how far the element overflows, not just whether it does", () => {
    expect(computeKeyboardScrollAdjustment(600, 400)).toBe(200 + 16);
  });

  it("respects a custom margin", () => {
    expect(computeKeyboardScrollAdjustment(420, 400, 8)).toBe(20 + 8);
  });
});
