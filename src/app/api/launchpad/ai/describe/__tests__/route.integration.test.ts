import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Integration coverage against a real Postgres for the AIDailyUsage
 * quota table the route shares with /api/ai/chat - the OpenAI client
 * itself is mocked (no real DeepSeek call), but the atomic-reservation
 * guard against Postgres is exercised for real, matching ai-quota.ts's
 * own test philosophy (see its doc comment on the concurrency bug this
 * pattern fixes).
 */
const { getServerSession, createResponse } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  createResponse: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: createResponse };
  },
}));

import { prisma } from "@/lib/db";
import { POST as describeToken } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(body: unknown) {
  ipCounter += 1;
  return new NextRequest("https://zrp.one/api/launchpad/ai/describe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.61`,
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/launchpad/ai/describe (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser(label: string, plan: "free" | "pro" = "free") {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@aidescribetest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        plan,
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.aIDailyUsage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
    createResponse.mockReset();
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  it("rejects an unauthenticated request (401)", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await describeToken(req({ theme: "a privacy-focused DeFi protocol" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty theme (400)", async () => {
    const user = await createUser("aidesc1");
    getServerSession.mockResolvedValue({ user: { id: user.id, plan: "free" } });
    const res = await describeToken(req({ theme: "" }));
    expect(res.status).toBe(400);
  });

  it("happy path: generates a suggestion and records usage against the shared AIDailyUsage quota", async () => {
    const user = await createUser("aidesc2");
    getServerSession.mockResolvedValue({ user: { id: user.id, plan: "free" } });
    createResponse.mockResolvedValue({ output_text: "Name: Privy\nSymbol: PRIV\nDescription: Privacy-first DeFi for everyone." });

    const res = await describeToken(req({ theme: "a privacy-focused DeFi protocol" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.suggestion).toContain("Privy");

    const usage = await prisma.aIDailyUsage.findFirst({ where: { userId: user.id } });
    expect(usage?.messages).toBe(1);
    expect(usage?.tokensUsed).toBeGreaterThan(0);
  });

  it("returns 429 once the free plan's daily limit is reached, without calling the model", async () => {
    const user = await createUser("aidesc3");
    getServerSession.mockResolvedValue({ user: { id: user.id, plan: "free" } });
    createResponse.mockResolvedValue({ output_text: "Name: X\nSymbol: X\nDescription: X" });

    // Free plan allows 10/day - exhaust it first.
    for (let i = 0; i < 10; i += 1) {
      const res = await describeToken(req({ theme: `theme ${i}` }));
      expect(res.status).toBe(200);
    }

    createResponse.mockClear();
    const res = await describeToken(req({ theme: "one more" }));
    expect(res.status).toBe(429);
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("releases the reserved quota slot when the model call fails, so a provider outage doesn't eat the user's quota", async () => {
    const user = await createUser("aidesc4");
    getServerSession.mockResolvedValue({ user: { id: user.id, plan: "free" } });
    createResponse.mockRejectedValue(new Error("DeepSeek unavailable"));

    const res = await describeToken(req({ theme: "a theme" }));
    expect(res.status).toBe(502);

    const usage = await prisma.aIDailyUsage.findFirst({ where: { userId: user.id } });
    expect(usage?.messages ?? 0).toBe(0);
  });
});
