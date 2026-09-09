import { describe, it, expect } from "vitest";
import {
  appendSourceMaterial,
  backoffMinutesFor,
  buildSourceMaterial,
  isSourceDue,
  sourceStatusFor,
  StoryIndex,
} from "../ingest";
import { fingerprint } from "../dedupe";

const NOW = new Date("2026-02-03T12:00:00Z");

describe("backoffMinutesFor", () => {
  it("backs off exponentially instead of retrying a struggling publisher", () => {
    expect(backoffMinutesFor(1)).toBe(15);
    expect(backoffMinutesFor(2)).toBe(30);
    expect(backoffMinutesFor(3)).toBe(60);
    expect(backoffMinutesFor(4)).toBe(120);
  });

  it("caps the wait so a source can still recover on its own", () => {
    expect(backoffMinutesFor(20)).toBe(12 * 60);
  });
});

describe("sourceStatusFor", () => {
  it("moves a source through healthy, warning and failed", () => {
    expect(sourceStatusFor(0)).toBe("HEALTHY");
    expect(sourceStatusFor(1)).toBe("WARNING");
    expect(sourceStatusFor(2)).toBe("WARNING");
    expect(sourceStatusFor(3)).toBe("FAILED");
  });
});

describe("isSourceDue", () => {
  const base = { enabled: true, backoffUntil: null, lastFetchedAt: null, fetchIntervalMinutes: 60 };

  it("polls a source that has never been fetched", () => {
    expect(isSourceDue(base, NOW)).toBe(true);
  });

  it("never polls a disabled source", () => {
    expect(isSourceDue({ ...base, enabled: false }, NOW)).toBe(false);
  });

  it("honours an active backoff", () => {
    expect(
      isSourceDue({ ...base, backoffUntil: new Date(NOW.getTime() + 60_000) }, NOW)
    ).toBe(false);
  });

  it("honours the polling interval", () => {
    expect(
      isSourceDue({ ...base, lastFetchedAt: new Date(NOW.getTime() - 30 * 60_000) }, NOW)
    ).toBe(false);
    expect(
      isSourceDue({ ...base, lastFetchedAt: new Date(NOW.getTime() - 90 * 60_000) }, NOW)
    ).toBe(true);
  });
});

describe("StoryIndex", () => {
  it("matches an identical headline exactly", () => {
    const index = new StoryIndex([
      { id: "a", title: "Storm closes Geneva airport", fingerprint: fingerprint("Storm closes Geneva airport") },
    ]);
    expect(index.match("Storm closes Geneva airport", fingerprint("Storm closes Geneva airport"))?.id).toBe("a");
  });

  it("matches a differently-worded report of the same event", () => {
    const index = new StoryIndex([
      { id: "a", title: "Storm closes Geneva airport", fingerprint: fingerprint("Storm closes Geneva airport") },
    ]);
    const title = "Geneva airport closed after overnight storm";
    expect(index.match(title, fingerprint(title))?.id).toBe("a");
  });

  it("returns null for an unrelated headline", () => {
    const index = new StoryIndex([
      { id: "a", title: "Storm closes Geneva airport", fingerprint: fingerprint("Storm closes Geneva airport") },
    ]);
    const title = "New museum opens in Lisbon";
    expect(index.match(title, fingerprint(title))).toBeNull();
  });

  it("ignores a duplicate fingerprint added twice", () => {
    const index = new StoryIndex();
    const entry = { id: "a", title: "T", fingerprint: "f" };
    index.add(entry);
    index.add({ ...entry, id: "b" });
    expect(index.size).toBe(1);
  });
});

describe("source material", () => {
  const item = {
    title: "Geneva airport closed",
    link: "https://example.org/a",
    summary: "Flights are suspended until midday.",
    publishedAt: NOW,
    imageUrl: null,
    guid: null,
  };

  it("attributes each contribution to its publisher", () => {
    expect(buildSourceMaterial("Example Wire", item)).toContain("[Example Wire] Geneva airport closed");
  });

  it("stays far short of article length", () => {
    const long = { ...item, summary: "word ".repeat(5000) };
    expect(buildSourceMaterial("Example Wire", long).length).toBeLessThanOrEqual(900);
  });

  it("accumulates corroborating sources without repeating one", () => {
    const first = buildSourceMaterial("Example Wire", item);
    const merged = appendSourceMaterial(first, "Geneva Airport", item);
    expect(merged).toContain("[Example Wire]");
    expect(merged).toContain("[Geneva Airport]");
    expect(appendSourceMaterial(merged, "Geneva Airport", item)).toBe(merged);
  });

  it("caps the accumulated material", () => {
    let material = buildSourceMaterial("P0", item);
    for (let index = 1; index < 30; index += 1) {
      material = appendSourceMaterial(material, `Publisher ${index}`, {
        ...item,
        summary: "word ".repeat(200),
      });
    }
    expect(material.length).toBeLessThanOrEqual(3000);
  });
});
