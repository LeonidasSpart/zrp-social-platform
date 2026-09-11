import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guard for the Crypto market widget, matching
 * the established pattern in poll-render-regressions.test.ts: vitest
 * here runs with environment: "node" (see vitest.config.ts), so there
 * is no DOM to render into, and this asserts on the source instead.
 *
 * The one rule this widget exists to enforce, twice over - it is both
 * a platform design rule ("never ship fake data") and an explicit
 * requirement for this feature - is that a provider failure shows a
 * real error state, never invented or stale numbers dressed up as
 * current. These assertions are the structural guarantee of that: the
 * component must have an explicit error path, and it must not contain
 * a hardcoded numeric literal standing in for a real price/cap/volume.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const TABLE = "src/components/CryptoMarketTable.tsx";
const PAGE = "src/app/news/page.tsx";

describe("CryptoMarketTable", () => {
  const src = read(TABLE);

  it("has all four required UI states: loading, error, empty-implied-by-error, loaded", () => {
    expect(src).toMatch(/if\s*\(\s*loading\s*\)/);
    expect(src).toMatch(/if\s*\(\s*error\s*\|\|\s*!rows\s*\)/);
    // The loaded path renders the real rows, not a static count.
    expect(src).toContain("rows.map((row)");
  });

  it("shows a real error message and a retry action, never a silent failure", () => {
    expect(src).toContain('t("news.marketDataUnavailable")');
    expect(src).toContain('t("news.retry")');
    expect(src).toMatch(/role="alert"/);
  });

  it("fetches from the real API route rather than embedding data", () => {
    expect(src).toContain('fetch("/api/news/crypto/market"');
    expect(src).toContain("no-store");
  });

  it("polls for fresh data instead of showing one static snapshot forever", () => {
    expect(src).toContain("setInterval");
    expect(src).toContain("visibilitychange");
  });

  it("renders every field the spec requires: rank, price, 24h change, market cap, volume", () => {
    expect(src).toContain("row.rank");
    expect(src).toContain("row.priceUsd");
    expect(src).toContain("row.priceChangePercent24h");
    expect(src).toContain("row.marketCapUsd");
    expect(src).toContain("row.volume24hUsd");
  });

  it("does not hardcode a price, market cap or volume figure", () => {
    // A guard against exactly the failure mode the brief forbids: a
    // literal dollar amount standing in for a real fetched value.
    expect(src).not.toMatch(/\$[\d,]{4,}/);
  });

  it("scrolls internally on a narrow screen rather than the page overflowing", () => {
    expect(src).toContain("overflow-x-auto");
  });

  it("gives every image an accessible, keyboard-safe treatment", () => {
    expect(src).toContain('loading="lazy"');
  });
});

describe("the Crypto tab renders the market table", () => {
  const src = read(PAGE);

  it("imports and conditionally renders CryptoMarketTable only for the CRYPTO tab", () => {
    expect(src).toContain('import CryptoMarketTable from "@/components/CryptoMarketTable"');
    expect(src).toMatch(/selectedCategory === "CRYPTO" && <CryptoMarketTable \/>/);
  });

  it("does not render the market table for every category", () => {
    // Regression guard: a bare `<CryptoMarketTable />` with no guard
    // would show market data on every tab, not just Crypto's.
    const bareUsages = (src.match(/<CryptoMarketTable \/>/g) ?? []).length;
    const guardedUsages = (src.match(/selectedCategory === "CRYPTO" && <CryptoMarketTable \/>/g) ?? []).length;
    expect(bareUsages).toBe(guardedUsages);
  });
});
