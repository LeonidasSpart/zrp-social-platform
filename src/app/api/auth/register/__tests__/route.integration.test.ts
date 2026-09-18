import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// RESEND_API_KEY intentionally unset in this suite: sendVerificationEmail
// fails soft (a console.warn, no external call - see src/lib/email.ts),
// so registration itself is never blocked on email delivery.

function registerReq(
  body: Record<string, unknown>,
  opts: { ip?: string; platform?: string; langCookie?: string } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  if (opts.platform) headers["x-zrp-platform"] = opts.platform;
  if (opts.langCookie) headers["cookie"] = `zrp-lang=${opts.langCookie}`;
  return new NextRequest("https://zrp.one/api/auth/register", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/*
 * Locks in the honest signup-attribution classification described in
 * docs/user-geography-and-acquisition.md Section 3: DIRECT/REFERRAL/
 * CAMPAIGN are all measurable facts about the request, never a guess,
 * and there is no "organic" bucket. Each scenario uses a distinct
 * X-Forwarded-For so the 5-per-hour registration rate limit
 * (src/lib/rate-limit.ts, keyed by client IP) gives every case its own
 * bucket instead of the whole suite sharing one.
 */
describe.skipIf(!hasRealDatabaseUrl)("POST /api/auth/register - signup attribution (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const emails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
  });

  async function registerAndFetch(
    label: string,
    body: Record<string, unknown>,
    opts: { ip: string; platform?: string; langCookie?: string }
  ) {
    const email = `register-attr-${label}-${runId}@example.com`;
    emails.push(email);
    const res = await POST(
      registerReq(
        { name: "Test User", username: `reg_${label}_${runId}`.slice(0, 20), email, password: "password123", ...body },
        opts
      )
    );
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return user;
  }

  it("classifies a signup with no ref/utm params as DIRECT, never a guessed 'organic'", async () => {
    const user = await registerAndFetch("direct", {}, { ip: "203.0.113.10" });
    expect(user.signupSource).toBe("DIRECT");
    expect(user.signupCampaign).toBeNull();
  });

  it("classifies a signup with a valid ambassador ref code as REFERRAL", async () => {
    const ambassadorOwner = await prisma.user.create({
      data: {
        email: `ambassador-owner-${runId}@example.com`,
        username: `amb_owner_${runId}`,
        password: "x",
      },
    });
    emails.push(ambassadorOwner.email);
    const code = `REF${runId}`;
    const ambassador = await prisma.ambassadorProfile.create({
      data: {
        userId: ambassadorOwner.id,
        invitationCode: code,
        countryCode: "CH",
        motivation: "integration test fixture",
      },
    });

    try {
      const user = await registerAndFetch("referral", { ref: code }, { ip: "203.0.113.20" });
      expect(user.signupSource).toBe("REFERRAL");
      expect(user.signupCampaign).toBe(code);
    } finally {
      await prisma.ambassadorProfile.delete({ where: { id: ambassador.id } }).catch(() => {});
    }
  });

  it("classifies an unrecognized ref code as CAMPAIGN, not DIRECT (a failed referral attempt is not 'no attribution')", async () => {
    const user = await registerAndFetch("badref", { ref: "TOTALLY-MADE-UP-CODE" }, { ip: "203.0.113.30" });
    expect(user.signupSource).toBe("CAMPAIGN");
    expect(user.signupCampaign).toBe("TOTALLY-MADE-UP-CODE");
  });

  it("classifies a utm_campaign/utm_source signup as CAMPAIGN", async () => {
    const user = await registerAndFetch(
      "utm",
      { utmSource: "newsletter", utmCampaign: "spring-launch" },
      { ip: "203.0.113.40" }
    );
    expect(user.signupSource).toBe("CAMPAIGN");
    expect(user.signupCampaign).toBe("spring-launch");
  });

  it("records signupPlatform from X-Zrp-Platform, defaulting to web when the header is absent", async () => {
    const androidUser = await registerAndFetch("android", {}, { ip: "203.0.113.50", platform: "android" });
    expect(androidUser.signupPlatform).toBe("android");

    const webUser = await registerAndFetch("webdefault", {}, { ip: "203.0.113.51" });
    expect(webUser.signupPlatform).toBe("web");
  });

  it("never mutates signupSource/signupCampaign/signupPlatform on this row again - they are set once at creation", async () => {
    const user = await registerAndFetch("immutable", {}, { ip: "203.0.113.60" });
    // Nothing in this route ever updates these fields post-create; this
    // assertion documents the invariant rather than exercising a second
    // write path (there isn't one - PUT /api/user and PUT /api/user/
    // profile deliberately never touch these three columns).
    expect(user.signupSource).toBe("DIRECT");
    expect(user.signupPlatform).toBe("web");
  });
});
