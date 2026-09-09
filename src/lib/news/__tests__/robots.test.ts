import { describe, it, expect } from "vitest";
import { isPathAllowed, parseRobots } from "../robots";

describe("parseRobots", () => {
  it("prefers a group naming ZRPNewsBot over the wildcard group", () => {
    const rules = parseRobots(`
User-agent: *
Disallow: /

User-agent: ZRPNewsBot
Disallow: /private
`);
    expect(rules.disallow).toEqual(["/private"]);
    expect(isPathAllowed(rules, "/feed.xml")).toBe(true);
    expect(isPathAllowed(rules, "/private/x")).toBe(false);
  });

  it("falls back to the wildcard group when we are not named", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin\n");
    expect(isPathAllowed(rules, "/admin/panel")).toBe(false);
    expect(isPathAllowed(rules, "/feed.xml")).toBe(true);
  });

  it("treats an empty Disallow as 'nothing is disallowed', not 'everything is'", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n");
    expect(rules.disallow).toEqual([]);
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("applies to several user-agents sharing one group", () => {
    const rules = parseRobots("User-agent: SomeBot\nUser-agent: ZRPNewsBot\nDisallow: /no\n");
    expect(isPathAllowed(rules, "/no/x")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots("# a comment\n\nUser-agent: *\nDisallow: /x # trailing\n");
    expect(rules.disallow).toEqual(["/x"]);
  });

  it("reads Crawl-delay", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 10\n").crawlDelaySeconds).toBe(10);
  });
});

describe("isPathAllowed", () => {
  it("lets the longest matching rule win, with Allow beating Disallow on a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /news\nAllow: /news/feed\n");
    expect(isPathAllowed(rules, "/news/article")).toBe(false);
    expect(isPathAllowed(rules, "/news/feed.xml")).toBe(true);
  });

  it("supports the * wildcard", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*/private\n");
    expect(isPathAllowed(rules, "/a/private/x")).toBe(false);
    expect(isPathAllowed(rules, "/a/public/x")).toBe(true);
  });

  it("supports the $ end anchor", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$\n");
    expect(isPathAllowed(rules, "/docs/report.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/docs/report.pdf.html")).toBe(true);
  });

  it("does not treat a regex metacharacter in a path as a pattern", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a+b\n");
    expect(isPathAllowed(rules, "/aaab")).toBe(true);
    expect(isPathAllowed(rules, "/a+b")).toBe(false);
  });
});
