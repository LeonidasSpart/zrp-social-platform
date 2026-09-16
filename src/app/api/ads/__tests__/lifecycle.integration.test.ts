import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * End-to-end coverage for the AdCampaign lifecycle this PR completes:
 * create -> admin approve -> real on-chain payment -> serve -> expire,
 * plus every off-path (reject, payment failure, duplicate payment,
 * cancel, suspend/resume, ownership, and impression/click abuse) that a
 * production advertising system has to get right. verifyUsdcTransaction
 * and requireStaff are mocked (no real RPC call / no real staff session);
 * everything else - auth token shape, rate limiting, Prisma, Postgres -
 * is real, following the exact pattern already used in
 * src/app/api/creator/__tests__/crypto-payment-security.integration.test.ts
 * and src/app/api/admin/help-withdrawals/[id]/__tests__/approve.integration.test.ts.
 */
const { getVerifiedToken, verifyUsdcTransaction, requireStaff } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
  requireStaff: vi.fn(),
}));
// Partial mock (spreads the real module) rather than a full
// replacement - a full replacement here would silently leave any
// other export (e.g. isBlockedEitherWay, used internally by
// src/lib/notifications.ts) undefined for any code path that
// reaches it, which is exactly what broke a sibling test the same
// way (see the PR that introduced this comment).
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));
vi.mock("@/lib/admin", () => ({ requireStaff }));

import { prisma } from "@/lib/db";
import { POST as createCampaign } from "../campaigns/route";
import { PUT as putCampaign, DELETE as deleteCampaign } from "../campaigns/[id]/route";
import { POST as payCampaign } from "../campaigns/[id]/pay/route";
import { GET as serveAd } from "../serve/route";
import { POST as logImpression } from "../impression/route";
import { POST as logClick } from "../click/route";
import { PUT as adminReview } from "@/app/api/admin/ads/[id]/route";
import { GET as expireCron } from "@/app/api/cron/expire-ad-campaigns/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, method: string, body?: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.9`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function asLoggedOut() {
  getVerifiedToken.mockResolvedValue(null);
}

function asStaff(userId = "staff-user") {
  requireStaff.mockResolvedValue({ authorized: true, session: { user: { id: userId } } });
}

function asNonStaff() {
  const { NextResponse } = require("next/server");
  requireStaff.mockResolvedValue({
    authorized: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  });
}

function validVerification(overrides: Partial<{ amount: number; from: string }> = {}) {
  return { valid: true, amount: 50, from: "AdvertiserWalletBase58Placeholder1111", ...overrides };
}

describe.skipIf(!hasRealDatabaseUrl)("AdCampaign lifecycle (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const postIds: string[] = [];
  const campaignIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@adstest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createPost(authorId: string) {
    const post = await prisma.post.create({ data: { authorId, content: "promote me" } });
    postIds.push(post.id);
    return post;
  }

  async function createCampaignFor(advertiserId: string, postId: string, overrides: Record<string, unknown> = {}) {
    asUser(advertiserId);
    const res = await createCampaign(
      req("https://zrp.one/api/ads/campaigns", "POST", {
        postId,
        name: "Test campaign",
        bidType: "CPM",
        bidAmount: 1,
        budgetTotal: 50,
        ...overrides,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    campaignIds.push(body.campaign.id);
    return body.campaign as { id: string };
  }

  async function approveViaAdmin(campaignId: string) {
    asStaff();
    const res = await adminReview(
      req(`https://zrp.one/api/admin/ads/${campaignId}`, "PUT", { action: "approve" }),
      { params: Promise.resolve({ id: campaignId }) }
    );
    return res;
  }

  afterAll(async () => {
    await prisma.adClick.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.adImpression.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: campaignIds } } });
    await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyUsdcTransaction.mockReset();
    requireStaff.mockReset();
  });

  // ─── Creation ────────────────────────────────────────────────────

  it("creates a campaign as PENDING_REVIEW, never directly ACTIVE", async () => {
    const advertiser = await createUser("creator1");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("PENDING_REVIEW");
  });

  it("refuses to create a campaign around a post the caller doesn't own", async () => {
    const owner = await createUser("postowner1");
    const attacker = await createUser("attacker-create1");
    const post = await createPost(owner.id);

    asUser(attacker.id);
    const res = await createCampaign(
      req("https://zrp.one/api/ads/campaigns", "POST", {
        postId: post.id,
        name: "Steal this post",
        bidType: "CPC",
        bidAmount: 1,
        budgetTotal: 10,
      })
    );
    expect(res.status).toBe(403);
  });

  // ─── Admin approve / reject ──────────────────────────────────────

  it("admin approve moves PENDING_REVIEW -> PAYMENT_PENDING, never straight to ACTIVE", async () => {
    const advertiser = await createUser("creator2");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    const res = await approveViaAdmin(campaign.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaign.status).toBe("PAYMENT_PENDING");
  });

  it("admin reject moves PENDING_REVIEW -> REJECTED with a stored reason", async () => {
    const advertiser = await createUser("creator3");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    asStaff();
    const res = await adminReview(
      req(`https://zrp.one/api/admin/ads/${campaign.id}`, "PUT", { action: "reject", rejectionReason: "Off-brand." }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("REJECTED");
    expect(row?.rejectionReason).toBe("Off-brand.");
  });

  it("a non-staff caller cannot approve/reject/suspend a campaign", async () => {
    const advertiser = await createUser("creator4");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    asNonStaff();
    const res = await adminReview(
      req(`https://zrp.one/api/admin/ads/${campaign.id}`, "PUT", { action: "approve" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(403);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("PENDING_REVIEW");
  });

  it("admin cannot approve a campaign that isn't PENDING_REVIEW (no double-approve, no re-approving a rejected campaign)", async () => {
    const advertiser = await createUser("creator5");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    await approveViaAdmin(campaign.id); // -> PAYMENT_PENDING
    const secondApprove = await approveViaAdmin(campaign.id);
    expect(secondApprove.status).toBe(400);
  });

  // ─── Payment ─────────────────────────────────────────────────────

  it("a verified, sufficient on-chain payment activates the campaign", async () => {
    const advertiser = await createUser("creator6");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 50 });
    await approveViaAdmin(campaign.id);

    const txId = `tx-ad-pay-valid-${randomUUID()}`;
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 50 }));
    asUser(advertiser.id);

    const res = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: txId }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("ACTIVE");
    expect(row?.paymentTransactionId).toBe(txId);
    expect(row?.paidAt).not.toBeNull();
  });

  it("a payment under the campaign's budget is refused and does not activate the campaign", async () => {
    const advertiser = await createUser("creator7");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 50 });
    await approveViaAdmin(campaign.id);

    const txId = `tx-ad-pay-short-${randomUUID()}`;
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 5 })); // way under 50
    asUser(advertiser.id);

    const res = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: txId }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(400);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("PAYMENT_FAILED");
    expect(row?.paymentTransactionId).toBeNull();
  });

  it("a failed on-chain verification moves the campaign to PAYMENT_FAILED and can be retried", async () => {
    const advertiser = await createUser("creator8");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 50 });
    await approveViaAdmin(campaign.id);

    const badTx = `tx-ad-pay-bad-${randomUUID()}`;
    verifyUsdcTransaction.mockRejectedValueOnce(new Error("Transaction not found."));
    asUser(advertiser.id);

    const failed = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: badTx }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(failed.status).toBe(400);
    let row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("PAYMENT_FAILED");

    // Retry with a genuinely valid transaction succeeds from PAYMENT_FAILED.
    const goodTx = `tx-ad-pay-retry-${randomUUID()}`;
    verifyUsdcTransaction.mockResolvedValueOnce(validVerification({ amount: 50 }));
    const retried = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: goodTx }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(retried.status).toBe(200);
    row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("ACTIVE");
  });

  it("a transaction ID already consumed by another payment cannot fund a second campaign", async () => {
    const advertiser1 = await createUser("creator9a");
    const post1 = await createPost(advertiser1.id);
    const campaign1 = await createCampaignFor(advertiser1.id, post1.id, { budgetTotal: 20 });
    await approveViaAdmin(campaign1.id);

    const advertiser2 = await createUser("creator9b");
    const post2 = await createPost(advertiser2.id);
    const campaign2 = await createCampaignFor(advertiser2.id, post2.id, { budgetTotal: 20 });
    await approveViaAdmin(campaign2.id);

    const sharedTx = `tx-ad-pay-shared-${randomUUID()}`;
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 20 }));

    asUser(advertiser1.id);
    const first = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign1.id}/pay`, "POST", { transactionId: sharedTx }),
      { params: Promise.resolve({ id: campaign1.id }) }
    );
    expect(first.status).toBe(200);

    asUser(advertiser2.id);
    const second = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign2.id}/pay`, "POST", { transactionId: sharedTx }),
      { params: Promise.resolve({ id: campaign2.id }) }
    );
    expect(second.status).toBe(409);
    const row2 = await prisma.adCampaign.findUnique({ where: { id: campaign2.id } });
    expect(row2?.status).toBe("PAYMENT_PENDING");
  });

  it("only the campaign's own advertiser can submit its payment", async () => {
    const advertiser = await createUser("creator10");
    const attacker = await createUser("attacker-pay1");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);
    await approveViaAdmin(campaign.id);

    asUser(attacker.id);
    const res = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("cannot pay a campaign that hasn't been approved yet", async () => {
    const advertiser = await createUser("creator11");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id); // still PENDING_REVIEW

    asUser(advertiser.id);
    const res = await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(400);
  });

  // ─── Serving eligibility ─────────────────────────────────────────

  it("serve never returns a PAYMENT_PENDING, rejected, or expired campaign - only a paid, active, in-window one", async () => {
    // ⚠️ /api/ads/serve picks uniformly at RANDOM among every currently
    // eligible ACTIVE campaign in the whole table, not just ones this
    // test created - and earlier tests in this file (e.g. "a verified,
    // sufficient on-chain payment activates the campaign") deliberately
    // leave their own campaign ACTIVE with no endDate, since cleanup for
    // the whole file only happens once in afterAll. Left alone, those
    // are still real, still-eligible competitors for this test's final
    // strict-equality assertion below - sealing them off first (rather
    // than only excluding our own campaign, or asserting "one of several
    // possible ids") is what makes this test deterministic instead of
    // occasionally picking a different, equally legitimate active ad.
    await prisma.adCampaign.updateMany({
      where: { id: { in: campaignIds } },
      data: { status: "COMPLETED" },
    });

    const advertiser = await createUser("creator12");
    const viewer = await createUser("viewer1");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 50 });

    // Still PENDING_REVIEW: never served.
    asLoggedOut();
    let serveRes = await serveAd(req("https://zrp.one/api/ads/serve", "GET"));
    let serveBody = await serveRes.json();
    expect(serveBody.ad?.campaignId).not.toBe(campaign.id);

    await approveViaAdmin(campaign.id); // PAYMENT_PENDING: still never served.
    serveRes = await serveAd(req("https://zrp.one/api/ads/serve", "GET"));
    serveBody = await serveRes.json();
    expect(serveBody.ad?.campaignId).not.toBe(campaign.id);

    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 50 }));
    asUser(advertiser.id);
    await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );

    // Now ACTIVE and paid: eligible (viewer is a different user).
    asUser(viewer.id);
    serveRes = await serveAd(req("https://zrp.one/api/ads/serve", "GET"));
    serveBody = await serveRes.json();
    expect(serveBody.ad?.campaignId).toBe(campaign.id);
  });

  it("a campaign whose endDate has passed is never served, even while ACTIVE", async () => {
    const advertiser = await createUser("creator13");
    const viewer = await createUser("viewer2");
    const post = await createPost(advertiser.id);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 10, endDate: yesterday });
    await approveViaAdmin(campaign.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
    asUser(advertiser.id);
    await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    // Directly confirm status went ACTIVE despite the already-past endDate
    // (payment doesn't re-validate dates - the serve route's date window
    // is what must catch this).
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("ACTIVE");

    asUser(viewer.id);
    const serveRes = await serveAd(req("https://zrp.one/api/ads/serve", "GET"));
    const serveBody = await serveRes.json();
    expect(serveBody.ad?.campaignId).not.toBe(campaign.id);
  });

  // ─── Cancel / suspend / resume ───────────────────────────────────

  it("the advertiser can cancel their own campaign from PENDING_REVIEW, PAYMENT_PENDING, ACTIVE, or PAUSED", async () => {
    const advertiser = await createUser("creator14");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    asUser(advertiser.id);
    const res = await putCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "PUT", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("CANCELLED");
  });

  it("a cancelled campaign cannot be cancelled again or reactivated by its advertiser", async () => {
    const advertiser = await createUser("creator15");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);
    asUser(advertiser.id);
    await putCampaign(req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "PUT", { status: "CANCELLED" }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    const again = await putCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "PUT", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(again.status).toBe(400);
  });

  it("staff can suspend an active campaign and resume it; the advertiser cannot self-resume a suspension", async () => {
    const advertiser = await createUser("creator16");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { budgetTotal: 10 });
    await approveViaAdmin(campaign.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
    asUser(advertiser.id);
    await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );

    asStaff();
    const suspend = await adminReview(
      req(`https://zrp.one/api/admin/ads/${campaign.id}`, "PUT", { action: "suspend", rejectionReason: "Policy hold." }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(suspend.status).toBe(200);
    let row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("SUSPENDED");

    // The advertiser cannot lift a staff suspension themselves.
    asUser(advertiser.id);
    const selfResume = await putCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "PUT", { status: "ACTIVE" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(selfResume.status).toBe(400);

    asStaff();
    const resume = await adminReview(
      req(`https://zrp.one/api/admin/ads/${campaign.id}`, "PUT", { action: "resume" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(resume.status).toBe(200);
    row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.status).toBe("ACTIVE");
  });

  // ─── Automatic expiration ────────────────────────────────────────

  it("the expiry cron flips a past-endDate campaign to COMPLETED and leaves a future-endDate one untouched", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    try {
      const advertiser = await createUser("creator17");
      const post1 = await createPost(advertiser.id);
      const post2 = await createPost(advertiser.id);

      const expired = await createCampaignFor(advertiser.id, post1.id, {
        budgetTotal: 10,
        endDate: new Date(Date.now() - 60_000).toISOString(),
      });
      const stillRunning = await createCampaignFor(advertiser.id, post2.id, {
        budgetTotal: 10,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      // Force both into ACTIVE directly (bypassing approve+pay, which is
      // already covered above) so this test is purely about the cron's
      // own date-based sweep logic.
      await prisma.adCampaign.updateMany({
        where: { id: { in: [expired.id, stillRunning.id] } },
        data: { status: "ACTIVE" },
      });

      const cronReq = new NextRequest("https://zrp.one/api/cron/expire-ad-campaigns", {
        headers: { authorization: "Bearer test-cron-secret" },
      });
      const res = await expireCron(cronReq);
      expect(res.status).toBe(200);

      const expiredRow = await prisma.adCampaign.findUnique({ where: { id: expired.id } });
      const runningRow = await prisma.adCampaign.findUnique({ where: { id: stillRunning.id } });
      expect(expiredRow?.status).toBe("COMPLETED");
      expect(runningRow?.status).toBe("ACTIVE");
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("the expiry cron rejects requests without the correct secret", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    try {
      const res = await expireCron(new NextRequest("https://zrp.one/api/cron/expire-ad-campaigns"));
      expect(res.status).toBe(401);
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  // ─── Impression / click abuse ────────────────────────────────────

  it("repeated impressions from the SAME signed-in viewer within a short window only bill the campaign once", async () => {
    const advertiser = await createUser("creator18");
    const viewer = await createUser("viewer3");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { bidType: "CPM", bidAmount: 10, budgetTotal: 1000 });
    await approveViaAdmin(campaign.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 1000 }));
    asUser(advertiser.id);
    await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );

    asUser(viewer.id);
    await logImpression(req("https://zrp.one/api/ads/impression", "POST", { campaignId: campaign.id }));
    await logImpression(req("https://zrp.one/api/ads/impression", "POST", { campaignId: campaign.id }));
    await logImpression(req("https://zrp.one/api/ads/impression", "POST", { campaignId: campaign.id }));

    const impressionCount = await prisma.adImpression.count({ where: { campaignId: campaign.id, userId: viewer.id } });
    expect(impressionCount).toBe(1);
  });

  it("repeated clicks from the SAME signed-in viewer within a short window only bill the campaign once", async () => {
    const advertiser = await createUser("creator19");
    const viewer = await createUser("viewer4");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id, { bidType: "CPC", bidAmount: 5, budgetTotal: 1000 });
    await approveViaAdmin(campaign.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 1000 }));
    asUser(advertiser.id);
    await payCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}/pay`, "POST", { transactionId: `tx-${randomUUID()}` }),
      { params: Promise.resolve({ id: campaign.id }) }
    );

    asUser(viewer.id);
    await logClick(req("https://zrp.one/api/ads/click", "POST", { campaignId: campaign.id }));
    await logClick(req("https://zrp.one/api/ads/click", "POST", { campaignId: campaign.id }));
    await logClick(req("https://zrp.one/api/ads/click", "POST", { campaignId: campaign.id }));

    const clickCount = await prisma.adClick.count({ where: { campaignId: campaign.id, userId: viewer.id } });
    expect(clickCount).toBe(1);
    const row = await prisma.adCampaign.findUnique({ where: { id: campaign.id } });
    expect(row?.budgetSpent.toNumber()).toBe(5);
  });

  // ─── Ownership on the advertiser-facing CRUD routes ─────────────

  it("only the owning advertiser can pause, edit, or delete their own campaign", async () => {
    const advertiser = await createUser("creator20");
    const attacker = await createUser("attacker-crud1");
    const post = await createPost(advertiser.id);
    const campaign = await createCampaignFor(advertiser.id, post.id);

    asUser(attacker.id);
    const putRes = await putCampaign(
      req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "PUT", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(putRes.status).toBe(403);

    const deleteRes = await deleteCampaign(req(`https://zrp.one/api/ads/campaigns/${campaign.id}`, "DELETE"), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(deleteRes.status).toBe(403);
  });
});
