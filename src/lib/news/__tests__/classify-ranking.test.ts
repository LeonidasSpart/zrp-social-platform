import { describe, it, expect } from "vitest";
import { assessConfidence, classifyTopic, detectBreaking, detectSensitive } from "../classify";
import { ageHours, isPublishable, MIN_PUBLISHABLE_SCORE, scoreStory } from "../ranking";

const NOW = new Date("2026-02-03T12:00:00Z");

describe("classifyTopic", () => {
  it("routes aviation, travel and transport stories to their own desks", () => {
    expect(classifyTopic("Geneva airport suspends departures", null)).toBe("AVIATION");
    expect(classifyTopic("New visa rules for travellers", null)).toBe("TRAVEL");
    expect(classifyTopic("Rail strike halts services", null)).toBe("TRANSPORTATION");
  });

  it("classifies across the languages the pipeline ingests", () => {
    expect(classifyTopic("Grève à l'aéroport de Nice", null)).toBe("AVIATION");
    expect(classifyTopic("Flughafen München meldet Verspätungen", null)).toBe("AVIATION");
  });

  it("falls back to WORLD rather than guessing", () => {
    expect(classifyTopic("Something entirely unremarkable happened", null)).toBe("WORLD");
  });

  it("uses the summary as well as the headline", () => {
    expect(classifyTopic("Update from the regulator", "New rules for bitcoin exchanges")).toBe(
      "CRYPTO"
    );
  });
});

describe("detectBreaking / detectSensitive", () => {
  it("spots breaking language", () => {
    expect(detectBreaking("BREAKING: flights grounded", null)).toBe(true);
    expect(detectBreaking("Quarterly results published", null)).toBe(false);
  });

  it("flags stories where an automated summary could do real harm", () => {
    expect(detectSensitive("Several killed in explosion", null)).toBe(true);
    expect(detectSensitive("Man arrested over alleged fraud", null)).toBe(true);
    expect(detectSensitive("Museum announces new exhibition", null)).toBe(false);
  });
});

describe("assessConfidence", () => {
  it("trusts an official source on its own", () => {
    expect(
      assessConfidence({ sourceCount: 1, bestTrustTier: 1, titles: ["Airport closed"], summaries: [null] })
    ).toBe("CONFIRMED");
  });

  it("needs two established outlets to confirm without an official source", () => {
    expect(
      assessConfidence({ sourceCount: 1, bestTrustTier: 2, titles: ["Airport closed"], summaries: [null] })
    ).toBe("DEVELOPING");
    expect(
      assessConfidence({ sourceCount: 2, bestTrustTier: 2, titles: ["Airport closed"], summaries: [null] })
    ).toBe("CONFIRMED");
  });

  it("drops to UNCONFIRMED when the sources themselves hedge", () => {
    expect(
      assessConfidence({
        sourceCount: 3,
        bestTrustTier: 1,
        titles: ["Airport reportedly closed"],
        summaries: ["Sources say the closure could last all day"],
      })
    ).toBe("UNCONFIRMED");
  });
});

describe("scoreStory", () => {
  const base = {
    sourceCount: 1,
    bestTrustTier: 2,
    confidence: "DEVELOPING" as const,
    isBreaking: false,
    topic: "WORLD" as const,
    firstSeenAt: NOW,
    now: NOW,
  };

  it("rewards corroboration", () => {
    expect(scoreStory({ ...base, sourceCount: 4 })).toBeGreaterThan(scoreStory(base));
  });

  it("rewards official sources", () => {
    expect(scoreStory({ ...base, bestTrustTier: 1 })).toBeGreaterThan(scoreStory(base));
  });

  it("penalises an unconfirmed story", () => {
    expect(scoreStory({ ...base, confidence: "UNCONFIRMED" })).toBeLessThan(scoreStory(base));
  });

  it("decays with age", () => {
    const old = scoreStory({ ...base, firstSeenAt: new Date(NOW.getTime() - 30 * 3600 * 1000) });
    expect(old).toBeLessThan(scoreStory(base));
  });

  it("gives no breaking bonus to a single hedged source shouting BREAKING", () => {
    const shouting = scoreStory({
      ...base,
      isBreaking: true,
      sourceCount: 1,
      confidence: "UNCONFIRMED",
    });
    const corroborated = scoreStory({
      ...base,
      isBreaking: true,
      sourceCount: 2,
      confidence: "CONFIRMED",
    });
    expect(shouting).toBeLessThan(corroborated);
  });

  it("never returns a negative score", () => {
    expect(
      scoreStory({
        ...base,
        confidence: "UNCONFIRMED",
        bestTrustTier: 3,
        firstSeenAt: new Date(NOW.getTime() - 40 * 3600 * 1000),
      })
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("isPublishable", () => {
  it("requires both a good enough score and a story that is not stale", () => {
    expect(isPublishable(MIN_PUBLISHABLE_SCORE, 1)).toBe(true);
    expect(isPublishable(MIN_PUBLISHABLE_SCORE - 0.1, 1)).toBe(false);
    expect(isPublishable(9, 40)).toBe(false);
  });
});

describe("ageHours", () => {
  it("never goes negative for a source-supplied future timestamp", () => {
    expect(ageHours(new Date(NOW.getTime() + 3600 * 1000), NOW)).toBe(0);
  });
});
