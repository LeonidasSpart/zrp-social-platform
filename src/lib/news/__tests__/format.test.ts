import { describe, it, expect } from "vitest";
import { composePostContent, isPostLengthValid, labelsFor, MAX_POST_LENGTH } from "../format";

const SOURCES = [
  { publisher: "Geneva Airport", url: "https://gva.example/notice" },
  { publisher: "Example Wire", url: "https://example.org/geneva" },
];

const BASE = {
  headline: "Geneva airport suspends departures after overnight storm",
  body: "Departures are suspended.\n\nThe airport authority expects operations to resume at midday.",
  topic: "AVIATION" as const,
  confidence: "CONFIRMED" as const,
  isBreaking: false,
  sources: SOURCES,
};

describe("composePostContent", () => {
  it("always carries the headline, the summary, the publishers and the source link", () => {
    const content = composePostContent({ ...BASE, language: "en" });
    expect(content).toContain(BASE.headline);
    expect(content).toContain("Departures are suspended.");
    expect(content).toContain("Geneva Airport");
    expect(content).toContain("Example Wire");
    expect(content).toContain("https://gva.example/notice");
  });

  it("labels a travel story in each of the four languages", () => {
    expect(composePostContent({ ...BASE, language: "en" })).toContain("TRAVEL UPDATE");
    expect(composePostContent({ ...BASE, language: "fr" })).toContain("INFO VOYAGE");
    expect(composePostContent({ ...BASE, language: "de" })).toContain("REISE-UPDATE");
    expect(composePostContent({ ...BASE, language: "it" })).toContain("AGGIORNAMENTO VIAGGI");
  });

  it("uses the right word for 'source' in each language", () => {
    const single = { ...BASE, sources: [SOURCES[0]] };
    expect(composePostContent({ ...single, language: "en" })).toContain("Source:");
    expect(composePostContent({ ...single, language: "fr" })).toContain("Source:");
    expect(composePostContent({ ...single, language: "de" })).toContain("Quelle:");
    expect(composePostContent({ ...single, language: "it" })).toContain("Fonte:");
  });

  it("marks a developing story rather than presenting it as settled", () => {
    const content = composePostContent({ ...BASE, language: "en", confidence: "DEVELOPING" });
    expect(content).toContain("DEVELOPING STORY");
  });

  it("says plainly when a story rests on a single source", () => {
    const content = composePostContent({ ...BASE, language: "de", confidence: "UNCONFIRMED" });
    expect(content).toContain("UNBESTÄTIGT");
  });

  it("does not label an unconfirmed story as breaking", () => {
    const content = composePostContent({
      ...BASE,
      language: "en",
      confidence: "UNCONFIRMED",
      isBreaking: true,
    });
    expect(content).not.toContain("BREAKING");
    expect(content).toContain("UNCONFIRMED");
  });

  it("shows a correction above the sources, clearly labelled", () => {
    const content = composePostContent({
      ...BASE,
      language: "it",
      correctionNote: "La chiusura riguarda solo le partenze.",
    });
    expect(content).toContain("CORREZIONE: La chiusura riguarda solo le partenze.");
    expect(content.indexOf("CORREZIONE")).toBeLessThan(content.indexOf("Fonti:"));
  });

  it("names the first few publishers and counts the rest", () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      publisher: `Publisher ${index}`,
      url: `https://example.org/${index}`,
    }));
    const content = composePostContent({ ...BASE, language: "en", sources: many });
    expect(content).toContain("and 3 more sources");
  });

  it("deduplicates a publisher that filed twice", () => {
    const content = composePostContent({
      ...BASE,
      language: "en",
      sources: [SOURCES[0], SOURCES[0], SOURCES[1]],
    });
    expect(content.match(/Geneva Airport/g)).toHaveLength(1);
  });

  it("falls back to English labels for a language it does not localise", () => {
    expect(labelsFor("zz").source).toBe("Source");
  });
});

describe("isPostLengthValid", () => {
  it("rejects empty and over-long content instead of truncating a summary mid-sentence", () => {
    expect(isPostLengthValid("")).toBe(false);
    expect(isPostLengthValid("a".repeat(MAX_POST_LENGTH + 1))).toBe(false);
    expect(isPostLengthValid(composePostContent({ ...BASE, language: "en" }))).toBe(true);
  });
});
