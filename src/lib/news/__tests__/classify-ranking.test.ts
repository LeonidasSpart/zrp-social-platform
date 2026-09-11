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

  // Real gap, found via production evidence: mainstream outlets almost
  // always write "cryptocurrency", not the bare word "crypto". The old
  // keyword list only matched "crypto" as its own whole token, which
  // never fires inside "cryptocurrency" since normalizeText strips
  // punctuation but never splits compound words - so ordinary crypto
  // coverage from a general-news source was silently never classified
  // as CRYPTO at all.
  it("recognises 'cryptocurrency', not just the bare word 'crypto'", () => {
    expect(classifyTopic("Regulators tighten rules on cryptocurrency exchanges", null)).toBe(
      "CRYPTO"
    );
    expect(classifyTopic("Retailers see rising demand for digital currency payments", null)).toBe(
      "CRYPTO"
    );
    expect(classifyTopic("Coinbase reports record quarterly trading volume", null)).toBe(
      "CRYPTO"
    );
  });

  it("routes video game coverage - PlayStation, Nintendo, Xbox - to GAMING", () => {
    expect(classifyTopic("Sony reveals new PlayStation 6 hardware", null)).toBe("GAMING");
    expect(classifyTopic("Nintendo announces new Switch console", null)).toBe("GAMING");
    expect(classifyTopic("Microsoft unveils next Xbox console lineup", null)).toBe("GAMING");
    expect(classifyTopic("Studio delays release of upcoming video game", null)).toBe("GAMING");
  });

  /*
   * Found while investigating the empty Crypto category: real crypto
   * coverage routinely uses vocabulary this list did not have at all -
   * an altcoin, Web3 or NFT story, or a CBDC/smart-contract story from
   * a general-news source, matched no keyword whatsoever and fell
   * through to WORLD. This matters most for Crypto specifically, since
   * (unlike Sports or Culture) it has no general-news fallback source -
   * a story lost at classification is a story the category never gets
   * back by any other path.
   */
  it("recognises altcoin, Web3, NFT and CBDC coverage as CRYPTO", () => {
    expect(classifyTopic("Popular altcoin surges after protocol upgrade", null)).toBe("CRYPTO");
    expect(classifyTopic("Gaming studio launches Web3 marketplace", null)).toBe("CRYPTO");
    expect(classifyTopic("Auction house sells record NFT collection", null)).toBe("CRYPTO");
    expect(classifyTopic("Digital euro CBDC pilot expands to five countries", null)).toBe("CRYPTO");
    expect(classifyTopic("Smart contract bug exposes millions in funds", null)).toBe("CRYPTO");
  });

  it("still lets a genuinely finance-centred CBDC story land in Finance", () => {
    // A headline built around "central bank" itself is legitimate
    // finance/monetary-policy signal too - CBDC does not always win,
    // and it should not: this is a real overlap, not a bug.
    expect(classifyTopic("Central bank considers interest rate impact of new CBDC", null)).toBe(
      "FINANCE"
    );
  });

  it("recognises 'crypto exchange' and 'crypto regulation' without those phrases alone hijacking unrelated stories", () => {
    expect(classifyTopic("Regulators unveil new crypto regulation framework", null)).toBe("CRYPTO");
    expect(classifyTopic("Crypto exchange expands into new markets", null)).toBe("CRYPTO");
    // A generic "exchange" or "regulation" story, with no crypto term
    // anywhere, must not be swept in by these phrases.
    expect(classifyTopic("Stock exchange extends trading hours", null)).not.toBe("CRYPTO");
    expect(classifyTopic("New banking regulation takes effect", null)).not.toBe("CRYPTO");
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

  /*
   * Real bug: the sensitive test was a raw substring match, so "coup"
   * fired on "a couple of" - and a sensitive story is held for human
   * review rather than published, so every ordinary sports report
   * containing that phrase was silently parked forever.
   */
  it("does not see a coup in a couple", () => {
    expect(detectSensitive("A couple of late goals sealed the win for Basel", null)).toBe(false);
    expect(detectSensitive("Studio announces a coupon promotion for the new game", null)).toBe(false);
  });

  it("still catches the real harm, in any tense", () => {
    // The whole point of the word list - narrowing the match must not
    // quietly stop it working.
    expect(detectSensitive("Military coup topples the government", null)).toBe(true);
    expect(detectSensitive("A bus crashed on the motorway", null)).toBe(true);
    expect(detectSensitive("Carmaker recalls 40000 vehicles", null)).toBe(true);
    expect(detectSensitive("Investigation into the collapse continues", null)).toBe(true);
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

  /*
   * Real bug, and it hit exactly the categories that were empty. The
   * hedge test was a raw substring match, so "claimed" fired inside
   * "acclaimed" and "reclaimed". A single-source tier-2 story marked
   * UNCONFIRMED scores 1.5 against a 2.5 publishing floor, so an
   * ordinary sports or culture report was not merely mislabelled - it
   * could never be published at all.
   */
  it("does not read a hedge into acclaimed or reclaimed", () => {
    const hedgeFreeSingleSource = (title: string) =>
      assessConfidence({ sourceCount: 1, bestTrustTier: 2, titles: [title], summaries: [null] });

    expect(hedgeFreeSingleSource("Switzerland reclaimed the title after a late goal")).toBe("DEVELOPING");
    expect(hedgeFreeSingleSource("The critically acclaimed studio announces its next game")).toBe("DEVELOPING");
  });

  it("treats a claim as a hedge only in the hedging construction", () => {
    const single = (title: string) =>
      assessConfidence({ sourceCount: 1, bestTrustTier: 2, titles: [title], summaries: [null] });

    // Ordinary sports usage: the driver did win pole.
    expect(single("Verstappen claims pole position in qualifying")).toBe("DEVELOPING");
    // Genuine hedging: the assertion is the source's, not established.
    expect(single("The company claims that the figures are wrong")).toBe("UNCONFIRMED");
    expect(single("He claimed to have finished the route first")).toBe("UNCONFIRMED");
  });

  it("still refuses to publish a story built on rumour", () => {
    const single = (title: string) =>
      assessConfidence({ sourceCount: 1, bestTrustTier: 2, titles: [title], summaries: [null] });

    expect(single("Rumours of a merger sent shares higher")).toBe("UNCONFIRMED");
    expect(single("The minister allegedly resigned")).toBe("UNCONFIRMED");
    expect(single("Speculation grows over the deal")).toBe("UNCONFIRMED");
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

  /*
   * Root cause of the empty Crypto category, made concrete: Crypto has
   * zero tier-1/2 fallback sources (see sources-seed.ts), so every
   * single-sourced crypto item is tier 3, DEVELOPING. Its score decays
   * with age and never recovers, so it stops clearing the publishing
   * floor a few hours in - permanently - while a confirmed story stays
   * publishable for nearly the full 36-hour window. This is not a
   * Crypto-specific rule; it is what the shared ranking formula does to
   * ANY topic that only ever has one tier-3 source, which is why the
   * fix is more/better sources (see the two added below), not a special
   * case in this formula.
   */
  it("a single tier-3 source stops being publishable within hours, and stays that way", () => {
    const tier3Single = { ...base, bestTrustTier: 3 };

    const fresh = scoreStory({ ...tier3Single, firstSeenAt: NOW });
    const fiveHoursOld = scoreStory({
      ...tier3Single,
      firstSeenAt: new Date(NOW.getTime() - 5 * 3600 * 1000),
    });
    const aDayOld = scoreStory({
      ...tier3Single,
      firstSeenAt: new Date(NOW.getTime() - 24 * 3600 * 1000),
    });

    expect(fresh).toBeGreaterThanOrEqual(MIN_PUBLISHABLE_SCORE);
    expect(fiveHoursOld).toBeLessThan(MIN_PUBLISHABLE_SCORE);
    expect(aDayOld).toBeLessThan(MIN_PUBLISHABLE_SCORE);
  });

  it("a second source agreeing clears that floor for nearly the full window", () => {
    // Two tier-3 outlets reporting the same story is CONFIRMED
    // regardless of tier (see assessConfidence) - this is the real
    // lever: corroboration, not a change to how trust tier is scored.
    const corroborated = {
      ...base,
      sourceCount: 2,
      bestTrustTier: 3,
      confidence: "CONFIRMED" as const,
    };

    const aDayOld = scoreStory({
      ...corroborated,
      firstSeenAt: new Date(NOW.getTime() - 24 * 3600 * 1000),
    });
    expect(aDayOld).toBeGreaterThanOrEqual(MIN_PUBLISHABLE_SCORE);
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
