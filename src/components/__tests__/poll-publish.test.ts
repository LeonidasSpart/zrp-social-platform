import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Publishing a poll was broken end to end on the web client, and the
 * shape of the failure is worth pinning precisely.
 *
 * The composer built the payload correctly, POST /api/posts persisted
 * the Poll row and returned it, GET /api/posts included it - and
 * PostCard.tsx, the single component that draws every post in the feed,
 * on a profile and in search, contained no reference to a poll at all.
 * Poll.tsx had existed with zero call sites anywhere in src. So every
 * poll ever published rendered as its question text and nothing else:
 * no options, no voting, no results. The native Android client rendered
 * polls the whole time, which is why this only ever looked like a
 * website problem.
 *
 * vitest runs environment: "node" here and collects only *.test.ts, so
 * there is no DOM to render into - these are source-level guards. The
 * behaviour itself was driven in a real browser against a real database:
 * publish -> 201, question and all three options render, vote -> POST
 * /api/polls/:id/vote 200, results and percentages survive a reload, and
 * the same poll renders on the profile.
 */

const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("poll rendering", () => {
  const card = read("src/components/PostCard.tsx");

  it("renders the Poll component for a post that has one", () => {
    expect(card).toContain('import Poll from "./Poll"');
    expect(card).toContain("{post.poll && (");
    expect(card).toContain("<Poll");
  });

  it("passes the poll id, question and options through", () => {
    const idx = card.indexOf("{post.poll && (");
    const block = card.slice(idx, idx + 1200);
    expect(block).toContain("pollId={post.poll.id}");
    expect(block).toContain("post.poll.question");
    expect(block).toContain("post.poll.options");
  });

  it("reads the viewer's own vote from the server-filtered relation", () => {
    const idx = card.indexOf("{post.poll && (");
    const block = card.slice(idx, idx + 1200);
    // votes_user is already scoped to the viewer by the API, so the
    // first entry is their vote. Never derived from a client-held id.
    expect(block).toContain("votes_user?.[0]");
    expect(block).toContain("optionIndex");
  });

  it("tolerates a poll nobody has voted on yet", () => {
    // Poll.votes is Json? on the model and is null until the first vote.
    const idx = card.indexOf("{post.poll && (");
    const block = card.slice(idx, idx + 1200);
    expect(block).toMatch(/post\.poll\.votes\s*\|\|/);
  });

  it("refreshes from the server after a vote instead of guessing counts", () => {
    const idx = card.indexOf("{post.poll && (");
    const block = card.slice(idx, idx + 1200);
    expect(block).toContain("onUpdate()");
  });
});

describe("poll data reaches every surface that draws a post", () => {
  // One PostCard serves the home feed, the profile and post detail. A
  // route that omits `poll` silently degrades that card to a plain text
  // post, which is how polls came to be missing on profiles.
  const routes = [
    "src/app/api/posts/route.ts",
    "src/app/api/posts/[id]/route.ts",
    "src/app/api/users/[username]/posts/route.ts",
  ];

  for (const route of routes) {
    it(`${route} includes the poll`, () => {
      const src = read(route);
      expect(src).toMatch(/poll:\s*\{/);
      expect(src).toContain("votes_user");
    });
  }
});

describe("composer poll payload", () => {
  const composer = read("src/components/PostComposer.tsx");

  it("sends the poll under the key the API reads", () => {
    expect(composer).toContain("payload.poll =");
    expect(composer).toContain("isPoll:");
  });

  it("only attaches a poll the user actually filled in", () => {
    expect(composer).toContain("showPollBuilder &&");
    expect(composer).toContain("isPollValid");
  });
});
