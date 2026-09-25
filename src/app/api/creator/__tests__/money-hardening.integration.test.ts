import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Trust-boundary coverage for money/entitlement fixes that span routes:
 * - plan payments (/api/payment/crypto) share the one-signature-one-payment
 *   ledger with tips (cross-purpose replay),
 * - a payment sent from a wallet verified-linked to ANOTHER account can't
 *   be claimed (front-running someone else's public signature),
 * - GET /api/creator/premium-post never leaks the gated post's content.
 * verifyUsdcTransaction is mocked; Prisma/Postgres are real.
 */
const { getVerifiedToken, verifyUsdcTransaction, getServerSession } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));
vi.mock("next-auth", () => ({ getServerSession }));

import { prisma } from "@/lib/db";
import { POST as tip } from "../tip/route";
import { POST as premiumPurchase } from "../premium-purchase/route";
import { GET as getPremiumPost } from "../premium-post/route";
import { POST as submitPlanPayment } from "@/app/api/payment/crypto/route";
import { POST as contributeToHelp } from "@/app/api/help/[id]/contribute/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, method = "POST", body?: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.77.${(ipCounter >> 8) & 255}.${ipCounter & 255}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

function asLoggedOut() {
  getVerifiedToken.mockResolvedValue(null);
  getServerSession.mockResolvedValue(null);
}

describe.skipIf(!hasRealDatabaseUrl)("money/entitlement hardening (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const postIds: string[] = [];
  const premiumPostIds: string[] = [];
  const txIds: string[] = [];
  const helpCampaignIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@moneyhard.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet: verifiedSolanaWallet ?? null,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createCreator(label: string) {
    const user = await createUser(label);
    const profile = await prisma.creatorProfile.create({
      data: { userId: user.id, tipsEnabled: true, premiumPostsEnabled: true },
    });
    return { user, profile };
  }

  function newTx(label: string) {
    const id = `tx-${label}-${randomUUID()}`;
    txIds.push(id);
    return id;
  }

  afterAll(async () => {
    await prisma.consumedPaymentTransaction.deleteMany({ where: { transactionId: { in: txIds } } });
    await prisma.helpCampaign.deleteMany({ where: { id: { in: helpCampaignIds } } });
    await prisma.premiumPurchase.deleteMany({ where: { premiumPostId: { in: premiumPostIds } } });
    await prisma.premiumPost.deleteMany({ where: { id: { in: premiumPostIds } } });
    await prisma.tip.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.paymentRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyUsdcTransaction.mockReset();
    getServerSession.mockReset();
  });

  // ─── Plan payment <-> tip cross-purpose replay ──────────────────

  it("a signature submitted as a plan payment cannot also be claimed as a tip", async () => {
    const payer = await createUser("planpayer1");
    const { user: alt } = await createCreator("planalt1");
    const txId = newTx("plan-then-tip");

    asUser(payer.id);
    const planRes = await submitPlanPayment(
      req("https://zrp.one/api/payment/crypto", "POST", { plan: "pro", transactionId: txId })
    );
    expect(planRes.status).toBe(200);

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 9.99, from: "" });
    const tipRes = await tip(
      req("https://zrp.one/api/creator/tip", "POST", { recipientId: alt.id, amount: 9.99, transactionId: txId })
    );
    expect(tipRes.status).toBe(409);
    expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
  });

  it("a signature already credited as a tip cannot be submitted as a plan payment", async () => {
    const payer = await createUser("tipthenplan1");
    const { user: creator } = await createCreator("tipthenplanc1");
    const txId = newTx("tip-then-plan");

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 9.99, from: "" });
    asUser(payer.id);
    const tipRes = await tip(
      req("https://zrp.one/api/creator/tip", "POST", { recipientId: creator.id, amount: 9.99, transactionId: txId })
    );
    expect(tipRes.status).toBe(200);

    const planRes = await submitPlanPayment(
      req("https://zrp.one/api/payment/crypto", "POST", { plan: "pro", transactionId: txId })
    );
    expect(planRes.status).toBe(409);
    expect(await prisma.paymentRequest.count({ where: { transactionId: txId } })).toBe(0);
  });

  it("two accounts cannot both submit the same signature as a plan payment", async () => {
    const a = await createUser("planA");
    const b = await createUser("planB");
    const txId = newTx("plan-dup");

    asUser(a.id);
    expect(
      (await submitPlanPayment(req("https://zrp.one/api/payment/crypto", "POST", { plan: "pro", transactionId: txId })))
        .status
    ).toBe(200);
    asUser(b.id);
    expect(
      (
        await submitPlanPayment(
          req("https://zrp.one/api/payment/crypto", "POST", { plan: "business", transactionId: txId })
        )
      ).status
    ).toBe(409);
    expect(await prisma.paymentRequest.count({ where: { transactionId: txId } })).toBe(1);
  });

  it("a non-string transactionId on the plan payment route is a 400, not a 500", async () => {
    const u = await createUser("planbad1");
    asUser(u.id);
    const res = await submitPlanPayment(
      req("https://zrp.one/api/payment/crypto", "POST", { plan: "pro", transactionId: { $ne: null } })
    );
    expect(res.status).toBe(400);
  });

  // ─── Sender binding: a wallet verified-linked to another account ─

  it("tip: an unlinked account cannot claim a payment sent from ANOTHER account's verified wallet", async () => {
    const victimWallet = `VictimW${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    await createUser("victim1", victimWallet);
    const thief = await createUser("thief1"); // no linked wallet
    const { user: thiefAlt } = await createCreator("thiefalt1");
    const txId = newTx("frontrun-tip");

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 10, from: victimWallet });
    asUser(thief.id);
    const res = await tip(
      req("https://zrp.one/api/creator/tip", "POST", { recipientId: thiefAlt.id, amount: 10, transactionId: txId })
    );
    expect(res.status).toBe(400);
    expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
    expect(await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId: txId } })).toBeNull();
  });

  it("HELP contribution: an unlinked account cannot claim a payment sent from ANOTHER account's verified wallet", async () => {
    const victimWallet = `VictimH${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    await createUser("victimh", victimWallet);
    const thief = await createUser("thiefh"); // no linked wallet
    const organizer = await createUser("organizerh");
    const campaign = await prisma.helpCampaign.create({
      data: {
        organizerId: organizer.id,
        category: "DISASTER",
        needTypes: ["MONEY"],
        title: "Flood relief",
        description: "Test campaign",
        status: "ACTIVE",
      },
    });
    helpCampaignIds.push(campaign.id);
    const txId = newTx("frontrun-help");

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 10, from: victimWallet });
    asUser(thief.id);
    const res = await contributeToHelp(
      req(`https://zrp.one/api/help/${campaign.id}/contribute`, "POST", { amount: 10, transactionId: txId }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(res.status).toBe(400);
    expect(await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId: txId } })).toBeNull();
    const after = await prisma.helpCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(Number(after.raisedAmount)).toBe(0);
  });

  it("premium purchase: an unlinked account cannot claim a payment sent from ANOTHER account's verified wallet", async () => {
    const victimWallet = `VictimP${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    await createUser("victim2", victimWallet);
    const thief = await createUser("thief2");
    const { user: creator, profile } = await createCreator("ppcreator1");
    const post = await prisma.post.create({ data: { authorId: creator.id, content: "secret" } });
    postIds.push(post.id);
    const pp = await prisma.premiumPost.create({ data: { postId: post.id, creatorProfileId: profile.id, price: 10 } });
    premiumPostIds.push(pp.id);
    const txId = newTx("frontrun-pp");

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 10, from: victimWallet });
    asUser(thief.id);
    const res = await premiumPurchase(
      req("https://zrp.one/api/creator/premium-purchase", "POST", { premiumPostId: pp.id, transactionId: txId })
    );
    expect(res.status).toBe(400);
    expect(await prisma.premiumPurchase.count({ where: { premiumPostId: pp.id } })).toBe(0);
  });

  it("tip: the verified owner of the sending wallet can still claim their own payment", async () => {
    const wallet = `OwnerW${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const owner = await createUser("owner1", wallet);
    const { user: creator } = await createCreator("ownercreator1");
    const txId = newTx("owner-tip");

    verifyUsdcTransaction.mockResolvedValue({ valid: true, amount: 10, from: wallet });
    asUser(owner.id);
    const res = await tip(
      req("https://zrp.one/api/creator/tip", "POST", { recipientId: creator.id, amount: 10, transactionId: txId })
    );
    expect(res.status).toBe(200);
  });

  // ─── Premium post status must not leak the gated content ─────────

  it("GET /api/creator/premium-post never returns the gated post's content to a non-buyer", async () => {
    const { user: creator, profile } = await createCreator("ppleak1");
    const secret = `the paid secret ${randomUUID()}`;
    const post = await prisma.post.create({
      data: { authorId: creator.id, content: secret, imageUrl: "https://utfs.io/f/secret.png" },
    });
    postIds.push(post.id);
    const pp = await prisma.premiumPost.create({
      data: { postId: post.id, creatorProfileId: profile.id, price: 5, previewContent: "preview" },
    });
    premiumPostIds.push(pp.id);

    asLoggedOut();
    const anon = await getPremiumPost(req(`https://zrp.one/api/creator/premium-post?postId=${post.id}`, "GET"));
    const anonText = await anon.text();
    expect(anon.status).toBe(200);
    expect(anonText).not.toContain(secret);
    expect(anonText).not.toContain("secret.png");

    const stranger = await createUser("ppstranger1");
    asUser(stranger.id);
    const strangerText = await (
      await getPremiumPost(req(`https://zrp.one/api/creator/premium-post?postId=${post.id}`, "GET"))
    ).text();
    expect(strangerText).not.toContain(secret);

    asUser(creator.id);
    const ownerBody = await (
      await getPremiumPost(req(`https://zrp.one/api/creator/premium-post?postId=${post.id}`, "GET"))
    ).json();
    expect(ownerBody.premiumPost.fullContent).toBe(secret);
  });
});
