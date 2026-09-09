import { describe, it, expect } from "vitest";
import {
  containmentSimilarity,
  DUPLICATE_THRESHOLD,
  findDuplicate,
  fingerprint,
  normalizeText,
  normalizeTitle,
  significantTokens,
  similarity,
  tokenSimilarity,
} from "../dedupe";

describe("normalizeText", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalizeText("Aéroport de Genève fermé : « tempête »!")).toBe(
      "aeroport de geneve ferme tempete"
    );
  });

  it("keeps non-Latin scripts instead of deleting them", () => {
    // An ASCII-only [^\w\s] filter would reduce this to an empty string
    // and make every Chinese headline a duplicate of every other.
    expect(normalizeText("北京首都机场关闭")).toBe("北京首都机场关闭");
  });
});

describe("significantTokens", () => {
  it("drops stopwords in every ingested language and sorts the rest", () => {
    expect(significantTokens("The storm closed the airport")).toEqual([
      "airport",
      "closed",
      "storm",
    ]);
    expect(significantTokens("Der Sturm hat den Flughafen geschlossen")).not.toContain("der");
    expect(significantTokens("La tempête a fermé l'aéroport")).not.toContain("la");
  });
});

describe("fingerprint", () => {
  it("is independent of word order", () => {
    expect(fingerprint("Storm closes Geneva airport")).toBe(
      fingerprint("Geneva airport closes storm")
    );
  });

  it("differs for genuinely different events", () => {
    expect(fingerprint("Storm closes Geneva airport")).not.toBe(
      fingerprint("Central bank raises interest rates")
    );
  });

  it("still produces a key for a headline made entirely of stopwords", () => {
    expect(fingerprint("the and of it")).toHaveLength(40);
  });
});

describe("similarity", () => {
  it("scores two wordings of the same event above the duplicate threshold", () => {
    const score = similarity(
      "Storm closes Geneva airport",
      "Geneva airport closed after overnight storm"
    );
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("scores unrelated events well below the threshold", () => {
    const score = similarity(
      "Storm closes Geneva airport",
      "Central bank raises interest rates by a quarter point"
    );
    expect(score).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it("catches the publisher suffix that the exact fingerprint cannot", () => {
    // "Storm closes Geneva airport - Example Wire" adds tokens, so it
    // gets a different fingerprint. Layer 2 is what stops it becoming a
    // second story, which is the reason the exact key is not the only
    // check.
    const bare = "Storm closes Geneva airport";
    const suffixed = "Storm closes Geneva airport - Example Wire";
    expect(fingerprint(bare)).not.toBe(fingerprint(suffixed));
    expect(similarity(bare, suffixed)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("uses containment so a longer headline still matches a short one", () => {
    const short = "Geneva airport closed";
    const long = "Geneva airport closed after overnight storm disrupts dozens of flights";
    expect(containmentSimilarity(short, long)).toBe(1);
    // Jaccard alone would have under-scored this pair.
    expect(tokenSimilarity(short, long)).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(similarity(short, long)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
});

describe("findDuplicate", () => {
  const existing = [
    { id: "a", title: "Storm closes Geneva airport" },
    { id: "b", title: "Central bank raises interest rates" },
  ];

  it("returns the best match above the threshold", () => {
    const match = findDuplicate("Geneva airport closed after overnight storm", existing);
    expect(match?.match.id).toBe("a");
  });

  it("returns null when nothing is close enough", () => {
    expect(findDuplicate("New museum opens in Lisbon", existing)).toBeNull();
  });

  it("collapses a whole wave of coverage of one event onto a single story", () => {
    // The exact failure this guard exists to prevent: fifteen outlets,
    // one airport closure, one ZRP post.
    const wave = [
      "Geneva airport closed after storm",
      "Storm forces closure of Geneva airport",
      "Geneva airport shut as storm hits",
      "Flights halted: Geneva airport closed by storm",
      "Geneva airport closure after overnight storm",
    ];
    for (const headline of wave) {
      expect(findDuplicate(headline, existing)?.match.id).toBe("a");
    }
  });
});

describe("normalizeTitle", () => {
  it("is the stored, comparable form of a headline", () => {
    expect(normalizeTitle("Storm closes Geneva airport!")).toBe("airport closes geneva storm");
  });
});
