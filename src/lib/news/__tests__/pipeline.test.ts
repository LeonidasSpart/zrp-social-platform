import { describe, it, expect } from "vitest";
import { selectStarvedFirst } from "../pipeline";

/*
 * Pure unit coverage for the generation-candidate starvation fix.
 *
 * Reproduces the exact production bug: a flat "top N by importance" cut
 * of the generation-candidate pool let a modest-but-genuinely-publishable
 * story in a thin category (Crypto has no tier-1/2 source, so it never
 * outranks a corroborated World/Politics story) lose the ranking every
 * single cycle and never get a rendition attempt at all - found via a
 * real production story that sat at status NEW with zero renditions for
 * almost a day.
 */
describe("selectStarvedFirst", () => {
  interface Story {
    id: string;
    category: string;
  }

  function pooled(count: number, category: string): Story[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `${category}-${index}`,
      category,
    }));
  }

  const categoryOf = (story: Story) => story.category;

  it("reproduces the bug: without starvation awareness a thin category never makes the cut", () => {
    // 30 WORLD stories all outrank the single CRYPTO story on the pool's
    // own order (importance desc), which is why it sits beyond the
    // per-cycle budget every cycle.
    const pool = [...pooled(30, "WORLD"), { id: "crypto-1", category: "CRYPTO" }];

    // No starvation awareness = plain "take the first N" (today's bug).
    const flatCut = pool.slice(0, 24);

    expect(flatCut.find((s) => s.category === "CRYPTO")).toBeUndefined();
  });

  it("gives the starved category's best candidate a slot even when it ranks below the budget", () => {
    const pool = [...pooled(30, "WORLD"), { id: "crypto-1", category: "CRYPTO" }];
    const starved = new Set(["CRYPTO"]);

    const selected = selectStarvedFirst(pool, starved, categoryOf, 24);

    expect(selected).toHaveLength(24);
    expect(selected.some((s) => s.id === "crypto-1")).toBe(true);
  });

  it("takes only one slot per starved category, never crowding out the rest of the budget", () => {
    const pool = [
      ...pooled(30, "WORLD"),
      { id: "crypto-1", category: "CRYPTO" },
      { id: "crypto-2", category: "CRYPTO" },
    ];
    const starved = new Set(["CRYPTO"]);

    const selected = selectStarvedFirst(pool, starved, categoryOf, 24);

    const cryptoSelected = selected.filter((s) => s.category === "CRYPTO");
    expect(cryptoSelected).toHaveLength(1);
    expect(cryptoSelected[0].id).toBe("crypto-1"); // best-ranked of the two
    expect(selected).toHaveLength(24);
  });

  it("changes nothing when no category is starved", () => {
    const pool = pooled(30, "WORLD");
    const selected = selectStarvedFirst(pool, new Set(), categoryOf, 24);

    expect(selected).toEqual(pool.slice(0, 24));
  });

  it("never exceeds the requested budget even with many starved categories", () => {
    const pool = [
      ...pooled(5, "WORLD"),
      { id: "crypto-1", category: "CRYPTO" },
      { id: "sports-1", category: "SPORTS" },
      { id: "science-1", category: "SCIENCE" },
    ];
    const starved = new Set(["CRYPTO", "SPORTS", "SCIENCE"]);

    const selected = selectStarvedFirst(pool, starved, categoryOf, 3);

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((s) => s.category))).toEqual(
      new Set(["CRYPTO", "SPORTS", "SCIENCE"])
    );
  });

  it("never invents a candidate: an empty pool selects nothing regardless of starvation", () => {
    const selected = selectStarvedFirst([], new Set(["CRYPTO"]), categoryOf, 24);
    expect(selected).toEqual([]);
  });
});
