import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { NewsArticleCategory, type NewsRegion, type NewsTopic } from "@prisma/client";
import { buildFeedRoster } from "../feeds";
import { CYCLE_WINDOW_MINUTES } from "../settings";
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

  /*
   * Found by the end-to-end test, and the reason it exists: the planner
   * spreads a cycle's publications over CYCLE_WINDOW_MINUTES, so a
   * window wider than the gap between cycles pushes the tail of every
   * plan past the next cycle. At the old 150 - sized for a run every
   * 2-3 hours - the categories at the bottom of a full plan could not
   * get an article inside the hour however much real news existed.
   */
  it("spreads a cycle's publications over no more than the gap between cycles", () => {
    const busiestGapMinutes = Math.min(
      ...scheduledCrons().map((cron) => {
        const [minute, hours] = cron.split(/\s+/);
        // Every entry is hourly (asserted above), so each contributes one
        // run per hour at its own minute.
        expect(hours).toBe("*");
        expect(minute).toMatch(/^\d+$/);
        return 60;
      })
    );

    expect(CYCLE_WINDOW_MINUTES).toBeLessThanOrEqual(busiestGapMinutes);
  });
});

describe("per-feed cadence caps every category at once per six hours", () => {
  const ROSTER = buildFeedRoster();

  /*
   * Explicit product decision: the pipeline cycle keeps polling and
   * summarising hourly so a story is ready the moment a category's
   * window opens, but no feed may actually publish more often than
   * once every six hours - the previous hourly cap posted up to 24
   * times a day per category, which was more than wanted.
   */
  it("never lets a feed post more often than once every six hours", () => {
    for (const feed of ROSTER) {
      expect(feed.minMinutesBetweenPosts).toBeGreaterThanOrEqual(360);
    }
  });

  it("caps every feed's daily ceiling at what a six-hour gap can actually reach", () => {
    for (const feed of ROSTER) {
      expect(feed.maxPostsPerDay).toBeLessThanOrEqual(4);
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

  it("covers every category from more than one source, so one failure is not fatal", () => {
    /*
     * A category resting on a single publisher goes dark the moment
     * that publisher changes a path or has a bad morning - which is
     * exactly how Sports stayed empty. Asserted for every automated
     * category rather than a hand-picked few, so the next category
     * added cannot quietly ship with one feed behind it.
     */
    for (const category of AUTOMATED_CATEGORIES) {
      const sources = SEED_SOURCES.filter((source) =>
        source.topics.some(
          (topic) => categoryFor(topic, source.region, source.country ?? null) === category
        )
      );
      expect(sources.length, `${category} rests on a single source`).toBeGreaterThanOrEqual(2);
    }
  });
});
