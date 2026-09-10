import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(username: string) {
  return {
    request: new NextRequest(`https://zrp.one/api/users/${username}/posts`),
    props: { params: Promise.resolve({ username }) },
  };
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Regression coverage: this is the route the profile page's default
// "Posts" tab actually calls (page.tsx fetches /api/users/${username}/posts,
// not /api/profile/[username]/posts), and it never selected a post's poll
// relation at all - unlike /api/posts and /api/posts/explore, which do.
// A poll published by a user therefore saved and voted on correctly, but
// reappeared on that user's own profile as a bare text post with no poll
// UI whatsoever, because `post.poll` was simply undefined in the response.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/users/[username]/posts polls (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const pollIds: string[] = [];
    const voteIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@userpoststest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.pollVote.deleteMany({ where: { id: { in: voteIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.poll.deleteMany({ where: { id: { in: pollIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("includes the poll's question/options/votes and the viewer's own vote for a poll on this profile", async () => {
      const author = await createUser("profauthor");
      const poll = await prisma.poll.create({
        data: {
          id: randomUUID(),
          question: `Profile poll ${runId}`,
          options: ["Red", "Green", "Blue"],
          votes: { "1": 1 },
        },
      });
      pollIds.push(poll.id);
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: "3-option poll test",
          authorId: author.id,
          isPoll: true,
          pollId: poll.id,
          status: "published",
        },
      });
      postIds.push(post.id);
      const v = await prisma.pollVote.create({
        data: { id: randomUUID(), pollId: poll.id, userId: author.id, optionIndex: 1 },
      });
      voteIds.push(v.id);

      getServerSession.mockResolvedValueOnce(sessionFor(author.id));

      const { request, props } = req(author.username);
      const res = await GET(request, props);
      const body = await res.json();
      const found = body.items.find((p: { id: string }) => p.id === post.id);

      expect(found).toBeDefined();
      expect(found.poll.question).toBe(poll.question);
      expect(found.poll.options).toEqual(["Red", "Green", "Blue"]);
      expect(found.poll.votes).toEqual({ "1": 1 });
      expect(found.poll.votes_user).toEqual([{ optionIndex: 1 }]);
    });

    it("a non-poll post on the same profile still has no poll data", async () => {
      const author = await createUser("profauthor2");
      const post = await prisma.post.create({
        data: { id: randomUUID(), content: "just a post", authorId: author.id, status: "published" },
      });
      postIds.push(post.id);
      getServerSession.mockResolvedValueOnce(null);

      const { request, props } = req(author.username);
      const res = await GET(request, props);
      const body = await res.json();
      const found = body.items.find((p: { id: string }) => p.id === post.id);

      expect(found).toBeDefined();
      expect(found.poll).toBeNull();
    });
  }
);
