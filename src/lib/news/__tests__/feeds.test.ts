import { describe, it, expect } from "vitest";
import { buildFeedRoster, EDITORIAL_BADGE_TYPE, EDITORIAL_EMAIL_DOMAIN, pilotFeedKeys } from "../feeds";
import { COUNTRIES } from "../config";
import { TRAVEL_LANGUAGES } from "../types";

const ROSTER = buildFeedRoster();

describe("editorial roster", () => {
  it("defines at least the 100-feed initial target", () => {
    expect(ROSTER.length).toBeGreaterThanOrEqual(100);
  });

  it("has unique keys and unique usernames", () => {
    expect(new Set(ROSTER.map((feed) => feed.key)).size).toBe(ROSTER.length);
    expect(new Set(ROSTER.map((feed) => feed.username)).size).toBe(ROSTER.length);
  });

  it("names every feed as a ZRP desk, never as a person", () => {
    for (const feed of ROSTER) {
      expect(feed.displayName.startsWith("ZRP ")).toBe(true);
    }
  });

  it("says in every bio that the account is an official automated ZRP feed", () => {
    for (const feed of ROSTER) {
      expect(feed.description).toContain("Official ZRP editorial feed");
      expect(feed.description).toContain("automated");
    }
  });

  it("uses usernames the app's own mention parser can represent", () => {
    for (const feed of ROSTER) {
      expect(feed.username).toMatch(/^[a-zA-Z0-9_]+$/);
    }
  });

  it("keeps every feed inside a sane posting envelope", () => {
    for (const feed of ROSTER) {
      expect(feed.minMinutesBetweenPosts).toBeGreaterThanOrEqual(120);
      expect(feed.maxPostsPerDay).toBeLessThanOrEqual(8);
    }
  });

  it("covers every country in the catalogue", () => {
    const countries = new Set(ROSTER.map((feed) => feed.country).filter(Boolean));
    for (const country of COUNTRIES) {
      expect(countries.has(country.code)).toBe(true);
    }
  });

  it("gives every country feed a real timezone rather than defaulting to UTC", () => {
    for (const feed of ROSTER.filter((entry) => entry.country)) {
      expect(feed.timezone).toContain("/");
    }
  });

  it("provides a travel desk in each of the four required languages", () => {
    const travelLanguages = ROSTER.filter((feed) =>
      /^travel-(en|fr|de|it)$/.test(feed.key)
    ).map((feed) => feed.language);

    for (const language of TRAVEL_LANGUAGES) {
      expect(travelLanguages).toContain(language);
    }
  });
});

describe("pilot", () => {
  const pilot = pilotFeedKeys();

  it("is a small controlled set, not the whole roster", () => {
    expect(pilot.length).toBeGreaterThan(0);
    expect(pilot.length).toBeLessThanOrEqual(10);
  });

  it("covers the pilot markets named in the brief", () => {
    expect(pilot).toContain("news-world");
    expect(pilot).toContain("news-ch");
    expect(pilot).toContain("news-fr");
    expect(pilot).toContain("news-de");
    expect(pilot).toContain("news-it");
    expect(pilot).toContain("travel-en");
  });
});

describe("account safety", () => {
  it("uses the reserved .invalid TLD so no sign-in flow can ever attach to a feed account", () => {
    // RFC 2606 guarantees .invalid can never be registered, so no OAuth
    // provider can verify an address in this domain.
    expect(EDITORIAL_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
  });

  it("uses a badge type distinct from the human journalist badge", () => {
    expect(EDITORIAL_BADGE_TYPE).toBe("editorial");
    expect(EDITORIAL_BADGE_TYPE).not.toBe("journalist");
  });
});
