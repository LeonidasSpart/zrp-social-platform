import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function voteReq(pollId: string, optionIndex: number) {
  return new NextRequest(`https://zrp.one/api/polls/${pollId}/vote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ optionIndex }),
  });
}

/*
 * Regression coverage: POST /api/polls/[id]/vote wrote the aggregate
 * `Poll.votes` JSON as a read-modify-write of the copy loaded at the
 * start of the request, so concurrent voters overwrote each other's
 * increment (lost votes), and a double-tap raced into a unique-
 * constraint 500. Also: a private account's poll could be voted on by
 * a non-follower.
 */
describe.skipIf(!hasRealDatabaseUrl)("POST /api/polls/[id]/vote (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const pollIds: string[] = [];

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { pollId: { in: pollIds } } });
    await prisma.poll.deleteMany({ where: { id: { in: pollIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string, data: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@pollvotetest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        ...data,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createPoll(authorId: string, expiresAt: Date | null = null) {
    const poll = await prisma.poll.create({
      data: { question: "Which?", options: ["a", "b", "c"], expiresAt },
    });
    pollIds.push(poll.id);
    await prisma.post.create({
      data: { authorId, content: "poll", pollId: poll.id, isPoll: true, status: "published" },
    });
    return poll;
  }

  function call(pollId: string, userId: string, optionIndex: number) {
    getServerSession.mockResolvedValueOnce({ user: { id: userId } });
    return POST(voteReq(pollId, optionIndex), { params: Promise.resolve({ id: pollId }) });
  }

  it("counts every vote when many different users vote concurrently", async () => {
    const author = await createUser("pvauthor");
    const poll = await createPoll(author.id);
    const voters = await Promise.all(Array.from({ length: 12 }, (_, i) => createUser(`pv${i}`)));

    const results = await Promise.all(voters.map((v, i) => call(poll.id, v.id, i % 2)));
    expect(results.every((r) => r.status === 200)).toBe(true);

    const after = await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } });
    const votes = after.votes as Record<string, number>;
    expect(votes["0"]).toBe(6);
    expect(votes["1"]).toBe(6);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(12);
  });

  it("lets a double-tap record exactly one vote, answering the loser with 400 instead of 500", async () => {
    const author = await createUser("pvauthor2");
    const voter = await createUser("pvdouble");
    const poll = await createPoll(author.id);

    const [a, b] = await Promise.all([call(poll.id, voter.id, 2), call(poll.id, voter.id, 2)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);

    const after = await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } });
    expect((after.votes as Record<string, number>)["2"]).toBe(1);
  });

  it("rejects a vote on an expired poll", async () => {
    const author = await createUser("pvauthor3");
    const voter = await createUser("pvlate");
    const poll = await createPoll(author.id, new Date(Date.now() - 1000));

    const res = await call(poll.id, voter.id, 0);
    expect(res.status).toBe(400);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(0);
  });

  it("refuses a non-follower's vote on a private account's poll", async () => {
    const author = await createUser("pvprivate", { isPrivate: true });
    const stranger = await createUser("pvstranger");
    const poll = await createPoll(author.id);

    const res = await call(poll.id, stranger.id, 0);
    expect(res.status).toBe(404);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(0);
  });
});
