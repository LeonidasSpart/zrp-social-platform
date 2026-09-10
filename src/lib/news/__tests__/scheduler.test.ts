import { describe, it, expect } from "vitest";
import {
  feedCoversStory,
  feedIsAvailableAt,
  idempotencyKeyFor,
  planCycle,
  rankStories,
  storyIsEligible,
  storyLanguageKey,
  type PlanCycleInput,
  type SchedulableFeed,
  type SchedulableStory,
} from "../scheduler";

const NOON_UTC = new Date("2026-02-03T12:00:00Z");

const SETTINGS: PlanCycleInput["settings"] = {
  maxPublicationsPerCycle: 12,
  maxPublicationsPerDay: 120,
  minMinutesBetweenPublications: 4,
  requireHumanReviewForSensitive: true,
  enabledLanguages: ["en", "fr", "de", "it"],
  enabledTopics: [],
  enabledRegions: [],
  enabledCountries: [],
};

function story(overrides: Partial<SchedulableStory> = {}): SchedulableStory {
  return {
    id: "story-1",
    topic: "WORLD",
    region: "EUROPE",
    country: "CH",
    importance: 6,
    isBreaking: false,
    sensitive: false,
    confidence: "CONFIRMED",
    firstSeenAt: new Date(NOON_UTC.getTime() - 60 * 60 * 1000),
    renditions: [{ id: "rendition-en", language: "en" }],
    ...overrides,
  };
}

function feed(overrides: Partial<SchedulableFeed> = {}): SchedulableFeed {
  return {
    id: "feed-1",
    region: "GLOBAL",
    country: null,
    language: "en",
    topics: [],
    timezone: "UTC",
    minMinutesBetweenPosts: 180,
    maxPostsPerDay: 6,
    lastPublishedAt: null,
    postsToday: 0,
    ...overrides,
  };
}

function plan(input: Partial<PlanCycleInput> = {}) {
  return planCycle({
    stories: [story()],
    feeds: [feed()],
    settings: SETTINGS,
    now: NOON_UTC,
    windowMinutes: 150,
    publishedStoryLanguages: new Set<string>(),
    publicationsToday: 0,
    ...input,
  });
}

describe("feedCoversStory", () => {
  it("gives a national feed only its own country's stories", () => {
    const swiss = feed({ country: "CH", region: "EUROPE" });
    expect(feedCoversStory(swiss, story({ country: "CH" }))).toBe(true);
    expect(feedCoversStory(swiss, story({ country: "FR" }))).toBe(false);
  });

  it("gives a regional feed anything from its region", () => {
    const europe = feed({ region: "EUROPE" });
    expect(feedCoversStory(europe, story({ region: "EUROPE", country: "FR" }))).toBe(true);
    expect(feedCoversStory(europe, story({ region: "ASIA", country: "JP" }))).toBe(false);
  });

  it("respects a topical desk's remit", () => {
    const travel = feed({ topics: ["TRAVEL", "AVIATION"] });
    expect(feedCoversStory(travel, story({ topic: "AVIATION" }))).toBe(true);
    expect(feedCoversStory(travel, story({ topic: "POLITICS" }))).toBe(false);
  });
});

describe("feedIsAvailableAt", () => {
  it("enforces the minimum gap between a feed's posts", () => {
    const recent = feed({
      lastPublishedAt: new Date(NOON_UTC.getTime() - 60 * 60 * 1000),
      minMinutesBetweenPosts: 180,
    });
    expect(feedIsAvailableAt(recent, NOON_UTC, story())).toBe(false);

    const older = feed({
      lastPublishedAt: new Date(NOON_UTC.getTime() - 4 * 60 * 60 * 1000),
      minMinutesBetweenPosts: 180,
    });
    expect(feedIsAvailableAt(older, NOON_UTC, story())).toBe(true);
  });

  it("enforces the daily cap", () => {
    expect(feedIsAvailableAt(feed({ postsToday: 6, maxPostsPerDay: 6 }), NOON_UTC, story())).toBe(
      false
    );
  });

  // ZRP News is a continuous 24/7 wire: routine news used to be skipped
  // between 23:00 and 06:00 in the feed's own timezone, which removed a
  // third of every day from the schedule and left overnight readers
  // with nothing. The gap and daily cap above are what prevent
  // flooding, and they apply at every hour equally.
  it("publishes routine news at every hour of the day, including overnight", () => {
    // 12:00 UTC is 03:00 in Los Angeles - the middle of the old quiet
    // window.
    const westCoast = feed({ timezone: "America/Los_Angeles" });
    expect(feedIsAvailableAt(westCoast, NOON_UTC, story())).toBe(true);

    // And every other hour of the day, for a feed anywhere.
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 1, 3, hour, 0, 0));
      expect(feedIsAvailableAt(feed({ timezone: "Europe/Zurich" }), at, story())).toBe(true);
    }
  });

  it("still lets breaking news and travel alerts through at any hour", () => {
    const westCoast = feed({ timezone: "America/Los_Angeles" });
    expect(feedIsAvailableAt(westCoast, NOON_UTC, story({ isBreaking: true }))).toBe(true);
    expect(feedIsAvailableAt(westCoast, NOON_UTC, story({ topic: "AVIATION" }))).toBe(true);
  });

  // The anti-flood limits are the only thing standing between a feed
  // and a flood, now that time-of-day no longer gates anything.
  it("still refuses a feed that has hit its gap or its daily cap, overnight included", () => {
    const midnightUtc = new Date(Date.UTC(2026, 1, 3, 0, 30, 0));
    const justPosted = feed({
      timezone: "Europe/Zurich",
      lastPublishedAt: new Date(midnightUtc.getTime() - 5 * 60 * 1000),
      minMinutesBetweenPosts: 60,
    });
    expect(feedIsAvailableAt(justPosted, midnightUtc, story())).toBe(false);

    const atCap = feed({ timezone: "Europe/Zurich", postsToday: 24, maxPostsPerDay: 24 });
    expect(feedIsAvailableAt(atCap, midnightUtc, story())).toBe(false);
  });
});

describe("storyIsEligible", () => {
  it("holds a sensitive story back for human review", () => {
    expect(storyIsEligible(story({ sensitive: true }), SETTINGS, NOON_UTC)).toBe(false);
    expect(
      storyIsEligible(story({ sensitive: true }), { ...SETTINGS, requireHumanReviewForSensitive: false }, NOON_UTC)
    ).toBe(true);
  });

  it("rejects a story below the publishable score", () => {
    expect(storyIsEligible(story({ importance: 1 }), SETTINGS, NOON_UTC)).toBe(false);
  });

  it("rejects a story older than the maximum age", () => {
    const old = story({ firstSeenAt: new Date(NOON_UTC.getTime() - 40 * 60 * 60 * 1000) });
    expect(storyIsEligible(old, SETTINGS, NOON_UTC)).toBe(false);
  });

  it("respects the admin topic, region and country filters", () => {
    expect(
      storyIsEligible(story({ topic: "SPORTS" }), { ...SETTINGS, enabledTopics: ["TRAVEL"] }, NOON_UTC)
    ).toBe(false);
    expect(
      storyIsEligible(story({ region: "ASIA" }), { ...SETTINGS, enabledRegions: ["EUROPE"] }, NOON_UTC)
    ).toBe(false);
    expect(
      storyIsEligible(story({ country: "JP" }), { ...SETTINGS, enabledCountries: ["CH"] }, NOON_UTC)
    ).toBe(false);
  });
});

describe("rankStories", () => {
  it("puts breaking news first, then importance, then the oldest", () => {
    const ranked = rankStories([
      story({ id: "low", importance: 3 }),
      story({ id: "high", importance: 9 }),
      story({ id: "breaking", importance: 4, isBreaking: true }),
    ]);
    expect(ranked.map((entry) => entry.id)).toEqual(["breaking", "high", "low"]);
  });
});

describe("planCycle", () => {
  it("publishes nothing when there is nothing worth publishing", () => {
    expect(plan({ stories: [] })).toEqual([]);
    expect(plan({ stories: [story({ importance: 0.5 })] })).toEqual([]);
  });

  it("publishes a story at most once per language, ever", () => {
    const slots = plan({
      stories: [story({ renditions: [{ id: "r-en", language: "en" }] })],
      feeds: [feed({ id: "feed-a" }), feed({ id: "feed-b" })],
    });
    expect(slots).toHaveLength(1);
  });

  it("never re-plans a story+language that has already been published", () => {
    const slots = plan({
      publishedStoryLanguages: new Set([storyLanguageKey("story-1", "en")]),
    });
    expect(slots).toEqual([]);
  });

  it("sends a travel story to one feed per language, not several per language", () => {
    const slots = plan({
      stories: [
        story({
          topic: "AVIATION",
          renditions: [
            { id: "r-en", language: "en" },
            { id: "r-fr", language: "fr" },
            { id: "r-de", language: "de" },
            { id: "r-it", language: "it" },
          ],
        }),
      ],
      feeds: [
        feed({ id: "travel-en", language: "en", topics: ["AVIATION"] }),
        feed({ id: "travel-en-2", language: "en", topics: ["AVIATION"] }),
        feed({ id: "travel-fr", language: "fr", topics: ["AVIATION"] }),
        feed({ id: "travel-de", language: "de", topics: ["AVIATION"] }),
        feed({ id: "travel-it", language: "it", topics: ["AVIATION"] }),
      ],
    });

    expect(slots.map((slot) => slot.language).sort()).toEqual(["de", "en", "fr", "it"]);
    expect(new Set(slots.map((slot) => slot.feedId)).size).toBe(4);
  });

  it("caps any one region at a third of a cycle", () => {
    const stories = Array.from({ length: 12 }, (_, index) =>
      story({
        id: `story-${index}`,
        region: "EUROPE",
        country: "CH",
        renditions: [{ id: `r-${index}`, language: "en" }],
      })
    );

    const feeds = Array.from({ length: 12 }, (_, index) =>
      feed({ id: `feed-${index}`, region: "EUROPE" })
    );

    const slots = planCycle({
      stories,
      feeds,
      settings: SETTINGS,
      now: NOON_UTC,
      windowMinutes: 150,
      publishedStoryLanguages: new Set(),
      publicationsToday: 0,
    });

    expect(slots.length).toBeLessThanOrEqual(4);
  });

  it("spreads routine publications across the window instead of firing them all at once", () => {
    const stories = Array.from({ length: 3 }, (_, index) =>
      story({
        id: `story-${index}`,
        region: (["EUROPE", "ASIA", "AFRICA"] as const)[index],
        country: null,
        topic: (["WORLD", "BUSINESS", "SCIENCE"] as const)[index],
        renditions: [{ id: `r-${index}`, language: "en" }],
      })
    );

    const feeds = Array.from({ length: 3 }, (_, index) => feed({ id: `feed-${index}` }));

    const slots = planCycle({
      stories,
      feeds,
      settings: SETTINGS,
      now: NOON_UTC,
      windowMinutes: 150,
      publishedStoryLanguages: new Set(),
      publicationsToday: 0,
    });

    expect(slots).toHaveLength(3);
    const times = slots.map((slot) => slot.scheduledFor.getTime());
    expect(new Set(times).size).toBe(3);
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(0);
  });

  it("schedules breaking news immediately", () => {
    const slots = plan({ stories: [story({ isBreaking: true })] });
    expect(slots[0].scheduledFor.getTime()).toBe(NOON_UTC.getTime());
  });

  it("respects the platform-wide daily cap", () => {
    expect(plan({ publicationsToday: 120 })).toEqual([]);
  });

  it("only publishes into languages the admin has enabled", () => {
    const slots = plan({
      stories: [story({ renditions: [{ id: "r-fr", language: "fr" }] })],
      feeds: [feed({ language: "fr" })],
      settings: { ...SETTINGS, enabledLanguages: ["en"] },
    });
    expect(slots).toEqual([]);
  });
});

describe("idempotencyKeyFor", () => {
  it("is story+language, so the database itself blocks a second publication", () => {
    expect(idempotencyKeyFor("story-1", "en")).toBe("story-1:en");
    expect(idempotencyKeyFor("story-1", "en")).toBe(idempotencyKeyFor("story-1", "en"));
    expect(idempotencyKeyFor("story-1", "fr")).not.toBe(idempotencyKeyFor("story-1", "en"));
  });
});
