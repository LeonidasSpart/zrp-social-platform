import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/posts/explore");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Regression coverage for L3 (ios-native/PARITY.md): GET /api/posts/explore
// never selected a post's poll at all, so a poll reaching For You rendered
// with no poll data - indistinguishable from a post that never had one -
// on every client. Also covers the freshness requirement the fix
// deliberately preserves: the viewer's own vote must never be baked into
// the 5-minute cached ranked list the way `liked` already isn't.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/posts/explore polls (integration, real Postgres + Redis)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const pollIds: string[] = [];
    const voteIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@exploretest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPollPost(authorId: string, question: string) {
      const poll = await prisma.poll.create({
        data: { id: randomUUID(), question, options: ["Yes", "No"], votes: { "0": 0, "1": 0 } },
      });
      pollIds.push(poll.id);
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: question,
          authorId,
          isPoll: true,
          pollId: poll.id,
          status: "published",
        },
      });
      postIds.push(post.id);
      return { post, poll };
    }

    async function vote(pollId: string, userId: string, optionIndex: number) {
      const v = await prisma.pollVote.create({
        data: { id: randomUUID(), pollId, userId, optionIndex },
      });
      voteIds.push(v.id);
      return v;
    }

    afterEach(async () => {
      const redis = await getRedisClient();
      if (redis) await redis.flushDb();
    });

    afterAll(async () => {
      await prisma.pollVote.deleteMany({ where: { id: { in: voteIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.poll.deleteMany({ where: { id: { in: pollIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("includes isPoll and the poll's question/options/votes/expiresAt for a poll post", async () => {
      const author = await createUser("polla");
      const question = `Is ${runId} a good test id?`;
      const { poll } = await createPollPost(author.id, question);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req());
      const body = await res.json();
      const found = body.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);

      expect(found).toBeDefined();
      expect(found.isPoll).toBe(true);
      expect(found.poll.question).toBe(question);
      expect(found.poll.options).toEqual(["Yes", "No"]);
      expect(found.poll.votes).toEqual({ "0": 0, "1": 0 });
      expect(found.poll).not.toHaveProperty("votes_user");
    });

    it("a non-poll post has no poll data", async () => {
      const author = await createUser("nopoll");
      const post = await prisma.post.create({
        data: { id: randomUUID(), content: "just a post", authorId: author.id, status: "published" },
      });
      postIds.push(post.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req());
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);
      expect(found.isPoll).toBe(false);
      expect(found.poll).toBeNull();
    });

    it("reflects the signed-in viewer's own vote as poll.votes_user", async () => {
      const author = await createUser("pollb");
      const voter = await createUser("voterb");
      const { poll } = await createPollPost(author.id, `Vote test ${runId} b`);
      await vote(poll.id, voter.id, 1);
      getServerSession.mockResolvedValueOnce(sessionFor(voter.id));

      const res = await GET(req());
      const body = await res.json();
      const found = body.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);
      expect(found.poll.votes_user).toEqual([{ optionIndex: 1 }]);
    });

    it("two different viewers of the same cached poll each see only their own vote", async () => {
      const author = await createUser("pollc");
      const voterX = await createUser("voterx");
      const voterY = await createUser("votery");
      const { poll } = await createPollPost(author.id, `Vote test ${runId} c`);
      await vote(poll.id, voterX.id, 0);
      // voterY never votes.

      getServerSession.mockResolvedValueOnce(sessionFor(voterX.id));
      const resX = await GET(req());
      const bodyX = await resX.json();
      const foundX = bodyX.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);
      expect(foundX.poll.votes_user).toEqual([{ optionIndex: 0 }]);

      // The cache key is per-viewer, so this isn't a shared-cache-leak
      // scenario - it's confirming the merge step keys strictly off the
      // requesting session, not off whatever happened to be cached.
      getServerSession.mockResolvedValueOnce(sessionFor(voterY.id));
      const resY = await GET(req());
      const bodyY = await resY.json();
      const foundY = bodyY.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);
      expect(foundY.poll.votes_user).toEqual([]);
    });

    it("a vote cast after the ranked list is already cached still shows up immediately, unlike `liked` never waiting out the cache either", async () => {
      const author = await createUser("polld");
      const voter = await createUser("voterd");
      const { poll } = await createPollPost(author.id, `Vote test ${runId} d`);
      getServerSession.mockResolvedValueOnce(sessionFor(voter.id));

      // First call primes the 5-minute cache with no vote yet.
      const res1 = await GET(req());
      const body1 = await res1.json();
      const found1 = body1.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);
      expect(found1.poll.votes_user).toEqual([]);

      await vote(poll.id, voter.id, 1);

      getServerSession.mockResolvedValueOnce(sessionFor(voter.id));
      const res2 = await GET(req());
      const body2 = await res2.json();
      const found2 = body2.posts.find((p: { poll?: { id: string } }) => p.poll?.id === poll.id);
      expect(found2.poll.votes_user).toEqual([{ optionIndex: 1 }]);
    });
  }
);
