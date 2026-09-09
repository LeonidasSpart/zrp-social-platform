import { describe, it, expect } from "vitest";
import { mapToArticleCategory } from "../news-article-bridge";

describe("mapToArticleCategory", () => {
  it("routes GAMING topic stories to the GAMING category", () => {
    expect(
      mapToArticleCategory({ topic: "GAMING", region: "NORTH_AMERICA", country: "US" })
    ).toBe("GAMING");
  });

  it("still puts Switzerland first regardless of topic", () => {
    expect(mapToArticleCategory({ topic: "GAMING", region: "EUROPE", country: "CH" })).toBe(
      "SWITZERLAND"
    );
  });

  it("falls back to WORLD for a topic with no category mapping and no region match", () => {
    expect(mapToArticleCategory({ topic: "EDUCATION", region: "GLOBAL", country: null })).toBe(
      "WORLD"
    );
  });
});
