import { safeFetch, SsrfBlockedError } from "@/lib/ssrf-guard";
import { getCached, setCached } from "@/lib/redis";

/*
 * robots.txt compliance for source polling.
 *
 * We only ever fetch a publisher's own syndication feed - a document
 * published specifically to be consumed by machines - but "we think
 * they meant for us to have it" is not the same as checking, so every
 * feed URL is tested against the host's robots.txt before it is
 * fetched, and a Disallow wins.
 *
 * Fail-closed on an ambiguous answer, fail-open only when robots.txt is
 * genuinely absent (404), which is the documented meaning of "no
 * restrictions".
 */

const USER_AGENT = "ZRPNewsBot";
const CACHE_TTL_SECONDS = 6 * 60 * 60;

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelaySeconds: number | null;
}

/**
 * Parses robots.txt, honouring the group whose User-agent matches
 * ZRPNewsBot, falling back to the `*` group. Later, more specific
 * matches win, exactly as the standard describes.
 */
export function parseRobots(text: string, userAgent = USER_AGENT): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelaySeconds: null };

  const specific: RobotsRules = { disallow: [], allow: [], crawlDelaySeconds: null };
  const wildcard: RobotsRules = { disallow: [], allow: [], crawlDelaySeconds: null };

  // A group is "User-agent: x" (possibly several) followed by
  // directives, until the next User-agent line starts a new group.
  let currentAgents: string[] = [];
  let startingNewGroup = true;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!startingNewGroup) {
        currentAgents = [];
        startingNewGroup = true;
      }
      currentAgents.push(value.toLowerCase());
      continue;
    }

    startingNewGroup = false;
    if (currentAgents.length === 0) continue;

    const targets: RobotsRules[] = [];
    if (currentAgents.includes(userAgent.toLowerCase())) targets.push(specific);
    if (currentAgents.includes("*")) targets.push(wildcard);
    if (targets.length === 0) continue;

    for (const target of targets) {
      if (field === "disallow") {
        // An empty Disallow means "nothing is disallowed" and must not
        // be recorded as the prefix "", which would match everything.
        if (value) target.disallow.push(value);
      } else if (field === "allow") {
        if (value) target.allow.push(value);
      } else if (field === "crawl-delay") {
        const delay = Number(value);
        if (Number.isFinite(delay) && delay >= 0) target.crawlDelaySeconds = delay;
      }
    }
  }

  const chosen =
    specific.disallow.length || specific.allow.length || specific.crawlDelaySeconds !== null
      ? specific
      : wildcard;

  rules.disallow = chosen.disallow;
  rules.allow = chosen.allow;
  rules.crawlDelaySeconds = chosen.crawlDelaySeconds;
  return rules;
}

function patternMatches(pattern: string, path: string): boolean {
  // robots.txt supports two wildcards: `*` (any sequence) and `$`
  // (end-of-path anchor).
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const escaped = body
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  const regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return regex.test(path);
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  // Longest matching rule wins; Allow beats Disallow on equal length.
  let bestDisallow = -1;
  let bestAllow = -1;

  for (const pattern of rules.disallow) {
    if (patternMatches(pattern, path)) bestDisallow = Math.max(bestDisallow, pattern.length);
  }
  for (const pattern of rules.allow) {
    if (patternMatches(pattern, path)) bestAllow = Math.max(bestAllow, pattern.length);
  }

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

/**
 * Fetches (and caches) robots.txt for a feed URL's host and reports
 * whether we may poll that URL.
 *
 * Returns true only when robots.txt genuinely permits it or does not
 * exist. A network failure, a 5xx, or an unreadable body returns false:
 * not knowing whether we are allowed is not permission.
 */
export async function isFeedUrlAllowed(feedUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return false;
  }

  const cacheKey = `news:robots:${parsed.origin}`;

  let rules = await getCached<RobotsRules | "none">(cacheKey);

  if (rules === null) {
    try {
      const response = await safeFetch(`${parsed.origin}/robots.txt`, {
        timeoutMs: 5000,
        maxBytes: 100_000,
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
      });

      if (response.statusCode === 404 || response.statusCode === 410) {
        rules = "none";
      } else if (response.statusCode >= 200 && response.statusCode < 300) {
        rules = parseRobots(response.body.toString("utf-8"));
      } else {
        return false;
      }
    } catch (error) {
      if (error instanceof SsrfBlockedError) return false;
      return false;
    }

    await setCached(cacheKey, rules, CACHE_TTL_SECONDS);
  }

  if (rules === "none") return true;

  return isPathAllowed(rules, `${parsed.pathname}${parsed.search}`);
}
