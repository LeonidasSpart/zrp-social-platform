import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ getVerifiedToken }));

import { POST as submit } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function postReq(challengeId: string, body: Record<string, unknown>) {
  ipCounter += 1;
  return new NextRequest(`https://zrp.one/api/play/challenges/${challengeId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.9`,
    },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

// This is the ONE place every PLAY game's score is trusted from - if a
// client's raw answers/score claims were ever taken at face value here,
// every leaderboard, duel and XP total downstream would be forgeable.
// These tests exercise that boundary directly against a real database
// rather than mocking Prisma, since the abuse scenarios (replay, duel
// double-submit) hinge on real row state across two requests.
describe.skipIf(!hasRealDatabaseUrl)("POST /api/play/challenges/[id]/submit - anti-cheat (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const duelIds: string[] = [];

  afterAll(async () => {
    await prisma.playAttempt.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.playDuel.deleteMany({ where: { id: { in: duelIds } } });
    await prisma.playChallenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.playProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@playtest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "$2a$10$playtestplaceholderhash0000000000000000000000000000",
        role: "USER",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createTriviaChallenge() {
    const challenge = await prisma.playChallenge.create({
      data: {
        type: "TRIVIA",
        title: "Test trivia",
        difficulty: "medium",
        content: { questions: [{ q: "2+2?", options: ["3", "4"], correctIndex: 1 }] },
      },
    });
    challengeIds.push(challenge.id);
    return challenge;
  }

  it("ignores a client-submitted score/xp claim and recomputes from the real answer key", async () => {
    const user = await createUser("solo1");
    const challenge = await createTriviaChallenge();
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const res = await submit(
      postReq(challenge.id, { answers: [1], timeMs: 500, score: 999999, xpEarned: 999999 }),
      params(challenge.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100); // from the real answer key, not the spoofed `score` field
    expect(body.xpEarned).toBeLessThan(100); // nowhere near the spoofed 999999
  });

  it("awards zero base XP on a repeat solo play of the same challenge (no infinite farming)", async () => {
    const user = await createUser("solo2");
    const challenge = await createTriviaChallenge();
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const first = await submit(postReq(challenge.id, { answers: [1], timeMs: 500 }), params(challenge.id));
    const firstBody = await first.json();
    expect(firstBody.xpEarned).toBeGreaterThan(0);

    const second = await submit(postReq(challenge.id, { answers: [1], timeMs: 500 }), params(challenge.id));
    const secondBody = await second.json();
    expect(secondBody.score).toBe(100); // replay still scores normally...
    expect(secondBody.xpEarned).toBe(0); // ...but earns no further XP
  });

  it("rejects a second submission to the same duel side instead of letting a player resubmit for a better score", async () => {
    const challenger = await createUser("duelc");
    const opponent = await createUser("dueopp");
    const challenge = await createTriviaChallenge();
    const duel = await prisma.playDuel.create({
      data: {
        challengeId: challenge.id,
        challengerId: challenger.id,
        opponentId: opponent.id,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    duelIds.push(duel.id);

    getVerifiedToken.mockResolvedValue({ id: challenger.id });
    const first = await submit(
      postReq(challenge.id, { answers: [0], timeMs: 500, duelId: duel.id }),
      params(challenge.id)
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.waitingForOpponent).toBe(true); // opponent hasn't played yet

    const resubmit = await submit(
      postReq(challenge.id, { answers: [1], timeMs: 500, duelId: duel.id }),
      params(challenge.id)
    );
    expect(resubmit.status).toBe(400);
    const resubmitBody = await resubmit.json();
    expect(resubmitBody.error).toMatch(/already played/i);
  });

  it("determines the duel winner from server-recorded scores, never from a client claim", async () => {
    const challenger = await createUser("duelw1");
    const opponent = await createUser("duelw2");
    const challenge = await createTriviaChallenge();
    const duel = await prisma.playDuel.create({
      data: {
        challengeId: challenge.id,
        challengerId: challenger.id,
        opponentId: opponent.id,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    duelIds.push(duel.id);

    getVerifiedToken.mockResolvedValue({ id: challenger.id });
    await submit(postReq(challenge.id, { answers: [1], timeMs: 500, duelId: duel.id, winnerId: opponent.id }), params(challenge.id));

    getVerifiedToken.mockResolvedValue({ id: opponent.id });
    const finalRes = await submit(
      postReq(challenge.id, { answers: [0], timeMs: 500, duelId: duel.id, winnerId: opponent.id }),
      params(challenge.id)
    );
    const finalBody = await finalRes.json();
    expect(finalBody.duelCompleted).toBe(true);
    // Challenger answered correctly (100) and opponent didn't (0), so the
    // challenger must win regardless of the `winnerId` either request tried to inject.
    expect(finalBody.winnerId).toBe(challenger.id);
  });

  it("404s for a REMOVED challenge instead of scoring against soft-deleted content", async () => {
    const user = await createUser("removed1");
    const challenge = await createTriviaChallenge();
    await prisma.playChallenge.update({ where: { id: challenge.id }, data: { status: "REMOVED" } });
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const res = await submit(postReq(challenge.id, { answers: [1], timeMs: 500 }), params(challenge.id));
    expect(res.status).toBe(404);
  });

  it("REACTION: an all-implausible submission (bot/macro speed) scores zero end to end", async () => {
    const user = await createUser("reaction1");
    const challenge = await prisma.playChallenge.create({
      data: { type: "REACTION", title: "Test reaction", difficulty: "medium", content: { rounds: 3 } },
    });
    challengeIds.push(challenge.id);
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const res = await submit(
      postReq(challenge.id, { reactionTimesMs: [5, 5, 5], timeMs: 1000 }),
      params(challenge.id)
    );
    const body = await res.json();
    expect(body.score).toBe(0);
  });
});
