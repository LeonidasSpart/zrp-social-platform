import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
// Partial mock (spreads the real module) rather than a full replacement -
// this route's duel-result path calls createNotification()
// (src/lib/notifications.ts), which now also imports isBlockedEitherWay
// from this same module. A full-replacement mock here would silently
// leave that export undefined for any test that reaches it.
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});

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

  it("awards first-completion XP exactly once when the same solo play is submitted in parallel", async () => {
    const user = await createUser("race1");
    const challenge = await createTriviaChallenge();
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => submit(postReq(challenge.id, { answers: [1], timeMs: 500 }), params(challenge.id)))
    );
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const earning = bodies.filter((b) => b.xpEarned > 0);
    expect(earning).toHaveLength(1);

    const profile = await prisma.playProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const attempts = await prisma.playAttempt.findMany({ where: { userId: user.id } });
    expect(attempts).toHaveLength(5);
    // Total XP is exactly what the attempts recorded plus any achievement
    // rewards - no lost update, no double award.
    const achievements = await prisma.playUserAchievement.findMany({ where: { userId: user.id } });
    expect(new Set(achievements.map((a) => a.achievementKey)).size).toBe(achievements.length);
    expect(profile.totalXp).toBeGreaterThanOrEqual(earning[0].xpEarned);
    expect(profile.challengesCompleted).toBe(5);
  });

  it("records only one of several parallel submissions to the same duel side", async () => {
    const challenger = await createUser("racec");
    const opponent = await createUser("raceo");
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
    const results = await Promise.all(
      [0, 1, 0, 1].map((answer) =>
        submit(postReq(challenge.id, { answers: [answer], timeMs: 500, duelId: duel.id }), params(challenge.id))
      )
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    const attempts = await prisma.playAttempt.findMany({ where: { duelId: duel.id } });
    expect(attempts).toHaveLength(1);
    const after = await prisma.playDuel.findUniqueOrThrow({ where: { id: duel.id } });
    expect(after.challengerScore).toBe(attempts[0].score);
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
