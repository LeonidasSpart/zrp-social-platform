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

      // Attribution for the affiliate/referral program (src/lib/referral.ts)
      // happens in the same transaction as user creation - a real Referral
      // row, not just the signupSource snapshot.
      const referral = await prisma.referral.findUnique({ where: { referredUserId: user.id } });
      expect(referral?.ambassadorProfileId).toBe(ambassador.id);
    } finally {
      await prisma.ambassadorProfile.delete({ where: { id: ambassador.id } }).catch(() => {});
    }
  });

  it("does not create a Referral row for a CAMPAIGN (unrecognized ref) or DIRECT signup", async () => {
    const directUser = await registerAndFetch("norefdirect", {}, { ip: "203.0.113.21" });
    const campaignUser = await registerAndFetch(
      "norefcampaign",
      { ref: "TOTALLY-MADE-UP-CODE-2" },
      { ip: "203.0.113.22" }
    );
    expect(await prisma.referral.findUnique({ where: { referredUserId: directUser.id } })).toBeNull();
    expect(await prisma.referral.findUnique({ where: { referredUserId: campaignUser.id } })).toBeNull();
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

/*
 * ZRP platform policy: minimum age 16. Required outright only for
 * `X-Zrp-Platform: ios` (the one client built to collect it -
 * RegisterView.swift) - see the module-level comment above MINIMUM_AGE
 * in ../route.ts for why Android/web cannot be made to require it
 * overnight without breaking every existing registration they send.
 * Validated for real (rejecting under-16, requiring Terms acceptance)
 * the moment ANY platform sends birthdate/termsAccepted, so a future
 * Android/web client gets the identical enforcement with zero backend
 * change.
 */
describe.skipIf(!hasRealDatabaseUrl)("POST /api/auth/register - minimum age (16+) and Terms acceptance", () => {
  const runId = randomUUID().slice(0, 8);
  const emails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
  });

  function isoDateYearsAgo(years: number, monthDayOffsetDays = 0): string {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    d.setUTCDate(d.getUTCDate() + monthDayOffsetDays);
    return d.toISOString().slice(0, 10);
  }

  async function attemptRegister(
    label: string,
    body: Record<string, unknown>,
    opts: { ip: string; platform?: string }
  ) {
    const email = `register-age-${label}-${runId}@example.com`;
    emails.push(email);
    const res = await POST(
      registerReq(
        { name: "Test User", username: `reg_age_${label}_${runId}`.slice(0, 20), email, password: "password123", ...body },
        opts
      )
    );
    return { res, email };
  }

  it("rejects an iOS registration with no birthdate at all", async () => {
    const { res } = await attemptRegister("ios_missing", {}, { ip: "203.0.114.10", platform: "ios" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("birthdate");
  });

  it("rejects an iOS registration under the minimum age (15 years old)", async () => {
    const { res } = await attemptRegister(
      "ios_under16",
      { birthdate: isoDateYearsAgo(15), termsAccepted: true },
      { ip: "203.0.114.11", platform: "ios" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("birthdate");
  });

  it("rejects a birthdate one day short of the 16th birthday (boundary)", async () => {
    const { res } = await attemptRegister(
      "ios_almost16",
      { birthdate: isoDateYearsAgo(16, 1), termsAccepted: true },
      { ip: "203.0.114.12", platform: "ios" }
    );
    expect(res.status).toBe(400);
  });

  it("accepts a birthdate exactly on the 16th birthday (boundary)", async () => {
    const { res, email } = await attemptRegister(
      "ios_exactly16",
      { birthdate: isoDateYearsAgo(16), termsAccepted: true },
      { ip: "203.0.114.13", platform: "ios" }
    );
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.birthdate).not.toBeNull();
    expect(user.termsAcceptedAt).not.toBeNull();
  });

  it("accepts a clearly adult birthdate", async () => {
    const { res, email } = await attemptRegister(
      "ios_adult",
      { birthdate: isoDateYearsAgo(30), termsAccepted: true },
      { ip: "203.0.114.14", platform: "ios" }
    );
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.birthdate).not.toBeNull();
  });

  it("rejects an iOS registration with a valid age but Terms not accepted", async () => {
    const { res } = await attemptRegister(
      "ios_noterms",
      { birthdate: isoDateYearsAgo(30), termsAccepted: false },
      { ip: "203.0.114.15", platform: "ios" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("termsAccepted");
  });

  it("rejects an iOS registration with Terms accepted omitted entirely", async () => {
    const { res } = await attemptRegister(
      "ios_noterms2",
      { birthdate: isoDateYearsAgo(30) },
      { ip: "203.0.114.16", platform: "ios" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("termsAccepted");
  });

  it("rejects an invalid (unparseable) birthdate string", async () => {
    const { res } = await attemptRegister(
      "ios_badformat",
      { birthdate: "not-a-date", termsAccepted: true },
      { ip: "203.0.114.17", platform: "ios" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("birthdate");
  });

  it("still registers Android/web with no birthdate at all - this gate must not break existing clients", async () => {
    const androidAttempt = await attemptRegister("android_legacy", {}, { ip: "203.0.114.20", platform: "android" });
    expect(androidAttempt.res.status).toBe(201);
    const androidUser = await prisma.user.findUniqueOrThrow({ where: { email: androidAttempt.email } });
    expect(androidUser.birthdate).toBeNull();
    expect(androidUser.termsAcceptedAt).toBeNull();

    const webAttempt = await attemptRegister("web_legacy", {}, { ip: "203.0.114.21" });
    expect(webAttempt.res.status).toBe(201);
    const webUser = await prisma.user.findUniqueOrThrow({ where: { email: webAttempt.email } });
    expect(webUser.birthdate).toBeNull();
  });

  it("validates a birthdate for real on Android/web too, the moment either platform sends one", async () => {
    const { res } = await attemptRegister(
      "android_under16",
      { birthdate: isoDateYearsAgo(10), termsAccepted: true },
      { ip: "203.0.114.22", platform: "android" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("birthdate");
  });
});
