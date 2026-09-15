import { describe, it, expect } from "vitest";
import {
  getProgressEventsToFire,
  shouldFireSkip,
  shouldFireImpression,
  shouldFireStart,
  type DiscoverWatchEventType,
} from "../discover-watch-client";

const setOf = (...types: DiscoverWatchEventType[]) => new Set(types);

describe("getProgressEventsToFire", () => {
  it("fires nothing before any threshold is reached", () => {
    expect(getProgressEventsToFire(1, 100, setOf())).toEqual([]);
  });

  it("fires PROGRESS_25 once the 25% mark is crossed", () => {
    expect(getProgressEventsToFire(26, 100, setOf())).toEqual(["PROGRESS_25"]);
  });

  it("fires every crossed threshold at once when time jumps (e.g. a seek or a slow tick)", () => {
    expect(getProgressEventsToFire(80, 100, setOf())).toEqual([
      "PROGRESS_25",
      "PROGRESS_50",
      "PROGRESS_75",
    ]);
  });

  it("never re-fires a threshold already recorded as fired", () => {
    expect(getProgressEventsToFire(30, 100, setOf("PROGRESS_25"))).toEqual([]);
  });

  it("only returns the NEW thresholds when some are already fired", () => {
    expect(getProgressEventsToFire(80, 100, setOf("PROGRESS_25"))).toEqual([
      "PROGRESS_50",
      "PROGRESS_75",
    ]);
  });

  it("fires COMPLETE at 98% even if it never reaches exactly 100%", () => {
    expect(getProgressEventsToFire(98, 100, setOf("PROGRESS_25", "PROGRESS_50", "PROGRESS_75"))).toEqual([
      "COMPLETE",
    ]);
  });

  it("does not fire COMPLETE just under the threshold", () => {
    expect(getProgressEventsToFire(97, 100, setOf())).not.toContain("COMPLETE");
  });

  it("is a no-op for a non-finite or zero duration (metadata not loaded yet)", () => {
    expect(getProgressEventsToFire(5, 0, setOf())).toEqual([]);
    expect(getProgressEventsToFire(5, NaN, setOf())).toEqual([]);
    expect(getProgressEventsToFire(5, Infinity, setOf())).toEqual([]);
  });

  it("clamps a currentTime beyond duration instead of throwing or over-reporting", () => {
    expect(getProgressEventsToFire(500, 100, setOf())).toEqual([
      "PROGRESS_25",
      "PROGRESS_50",
      "PROGRESS_75",
      "COMPLETE",
    ]);
  });
});

describe("shouldFireSkip", () => {
  it("is false before playback ever started (a scroll-past is not a skip)", () => {
    expect(shouldFireSkip(setOf())).toBe(false);
    expect(shouldFireSkip(setOf("IMPRESSION"))).toBe(false);
  });

  it("is true once playback started and the clip never completed", () => {
    expect(shouldFireSkip(setOf("IMPRESSION", "START"))).toBe(true);
    expect(shouldFireSkip(setOf("IMPRESSION", "START", "PROGRESS_25"))).toBe(true);
  });

  it("is false once the clip actually completed", () => {
    expect(shouldFireSkip(setOf("START", "COMPLETE"))).toBe(false);
  });

  it("is false if a skip was already recorded (never double-fired)", () => {
    expect(shouldFireSkip(setOf("START", "SKIP"))).toBe(false);
  });
});

describe("shouldFireImpression / shouldFireStart", () => {
  it("fire exactly once per session", () => {
    expect(shouldFireImpression(setOf())).toBe(true);
    expect(shouldFireImpression(setOf("IMPRESSION"))).toBe(false);
    expect(shouldFireStart(setOf())).toBe(true);
    expect(shouldFireStart(setOf("START"))).toBe(false);
  });
});
