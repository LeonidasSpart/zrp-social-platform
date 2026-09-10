import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { NewsArticleCategory, type NewsRegion, type NewsTopic } from "@prisma/client";
import { buildFeedRoster } from "../feeds";
import { SEED_SOURCES } from "../sources-seed";
import { mapToArticleCategory } from "../news-article-bridge";

/*
 * ZRP News is a continuous hourly wire: every category it displays must
 * be reachable, hour after hour, from a real source through a real
 * desk. These are the structural guarantees behind that - the parts
 * that can be checked without a network or a database, so a change that
 * quietly strands a category fails here rather than on the live site.
 */

const WORKFLOW = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/cron-news-pipeline.yml"),
  "utf-8"
);

/** Every `- cron: "..."` entry declared in the workflow. */
function scheduledCrons(): string[] {
  const pattern = /-\s*cron:\s*"([^"]+)"/g;
  const found: string[] = [];
  let match = pattern.exec(WORKFLOW);
  while (match !== null) {
    found.push(match[1]);
    match = pattern.exec(WORKFLOW);
  }
  return found;
}

describe("hourly automation", () => {
  it("is scheduled every hour, not every few hours", () => {
    const crons = scheduledCrons();
    expect(crons.length).toBeGreaterThan(0);

    // Every entry must run at least hourly: an hours field of "*" (or a
    // step of 1) rather than the old "*/2".
    for (const cron of crons) {
      const hoursField = cron.split(/\s+/)[1];
      expect(hoursField).toBe("*");
    }
  });

  it("keeps a second staggered run, because scheduled workflows get dropped", () => {
    const minutes = new Set(scheduledCrons().map((c) => c.split(/\s+/)[0]));
    expect(minutes.size).toBeGreaterThanOrEqual(2);
  });

  it("allows the caller enough time for a full cycle", () => {
    const maxTime = WORKFLOW.match(/--max-time\s+(\d+)/);
    expect(maxTime).not.toBeNull();
    expect(Number(maxTime![1])).toBeGreaterThanOrEqual(900);
  });
});

describe("per-feed cadence permits hourly publishing", () => {
  const ROSTER = buildFeedRoster();

  it("lets every feed post at least once an hour", () => {
    for (const feed of ROSTER) {
      expect(feed.minMinutesBetweenPosts).toBeLessThanOrEqual(60);
    }
  });

  it("gives every feed a daily ceiling that a 24-hour wire can actually reach", () => {
    for (const feed of ROSTER) {
      expect(feed.maxPostsPerDay).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("every ZRP News category is reachable", () => {
  const ROSTER = buildFeedRoster();

  /*
   * COMMUNITY is deliberately excluded. It is the human/community
   * category of the pre-existing journalist workflow, and no NewsTopic
   * maps to it: routing automated wire copy there would be exactly the
   * mis-categorisation this system is supposed to prevent.
   */
  const AUTOMATED_CATEGORIES = Object.values(NewsArticleCategory).filter(
    (category) => category !== "COMMUNITY"
  );

  function categoryFor(topic: NewsTopic, region: NewsRegion, country: string | null) {
    return mapToArticleCategory({ topic, region, country });
  }

  it("has a desk in the roster whose remit produces each category", () => {
    for (const category of AUTOMATED_CATEGORIES) {
      const reachable = ROSTER.some((feed) => {
        // A desk with no topic restriction takes anything its
        // region/country covers; a topic desk takes only its own.
        const topics: NewsTopic[] =
          feed.topics.length > 0 ? feed.topics : (["WORLD", "POLITICS"] as NewsTopic[]);
        return topics.some(
          (topic) => categoryFor(topic, feed.region, feed.country) === category
        );
      });

      expect(reachable, `no desk can ever produce ${category}`).toBe(true);
    }
  });

  it("has at least one seeded source able to feed each category", () => {
    for (const category of AUTOMATED_CATEGORIES) {
      const covered = SEED_SOURCES.some((source) => {
        const topics: NewsTopic[] =
          source.topics.length > 0 ? source.topics : (["WORLD"] as NewsTopic[]);
        return topics.some(
          (topic) => categoryFor(topic, source.region, source.country ?? null) === category
        );
      });

      expect(covered, `no source can ever produce ${category}`).toBe(true);
    }
  });

  it("keeps a working Switzerland source, which is its own category", () => {
    const swiss = SEED_SOURCES.filter((source) => source.country === "CH");
    // More than one: the original swissinfo feed path returns a real
    // 404, so Switzerland must not depend on a single source again.
    expect(swiss.length).toBeGreaterThanOrEqual(2);
  });

  it("covers each category from more than one source where it can, so one failure is not fatal", () => {
    // Sports and Gaming are the narrow ones; both should have a spare.
    for (const category of [
      "SPORTS",
      "GAMING",
      "CRYPTO",
      "CULTURE",
      "SWITZERLAND",
    ] as NewsArticleCategory[]) {
      const sources = SEED_SOURCES.filter((source) =>
        source.topics.some(
          (topic) => categoryFor(topic, source.region, source.country ?? null) === category
        )
      );
      expect(sources.length, `${category} has no fallback source`).toBeGreaterThanOrEqual(2);
    }
  });
});
