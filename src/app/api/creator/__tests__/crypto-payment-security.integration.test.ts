import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Cross-route crypto payment security coverage: tip, premium purchase,
 * and HELP contribution all mint entitlements from the same primitive
 * (a verified on-chain USDC transfer to the platform wallet), so the
 * dangerous case - a single real payment being credited more than once,
 * possibly to different accounts, possibly across different product
 * surfaces - can only be proven by exercising all three together against
 * a real database.
 *
 * verifyUsdcTransaction is mocked (no real RPC call - see solana.test.ts
 * for unit coverage of the verification logic itself); everything else
 * - auth, rate limiting, Prisma, Postgres - is real.
 */
const { getVerifiedToken, verifyUsdcTransaction } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
}));
vi.mock("@/lib/auth-guards", () => ({ getVerifiedToken }));
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));

import { prisma } from "@/lib/db";
import { POST as tip } from "../tip/route";
import { POST as premiumPurchase } from "../premium-purchase/route";
import { POST as contribute } from "@/app/api/help/[id]/contribute/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Every request gets its own client IP so the per-route rate limiters
// (10/60s) never trip across the many calls in this file.
let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.9`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

// A valid-looking verified on-chain result, matching what
// verifyUsdcTransaction returns for a real payment.
function validVerification(overrides: Partial<{ amount: number; from: string }> = {}) {
  return { valid: true, amount: 10, from: "SenderWalletBase58Placeholder111111", ...overrides };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "Crypto payment security: replay, sender binding, cross-route reuse (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const campaignIds: string[] = [];
    const premiumPostIds: string[] = [];
    const postIds: string[] = [];

    async function createUser(label: string, verifiedSolanaWallet?: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@cryptotest.example`,
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

    async function createPremiumPost(creatorProfileId: string, authorId: string, price = 10) {
      const post = await prisma.post.create({ data: { authorId, content: "premium" } });
      postIds.push(post.id);
      const pp = await prisma.premiumPost.create({
        data: { postId: post.id, creatorProfileId, price },
      });
      premiumPostIds.push(pp.id);
      return pp;
    }

    async function createCampaign(organizerId: string) {
      const campaign = await prisma.helpCampaign.create({
        data: {
          organizerId,
          category: "OTHER",
          needTypes: ["MONEY"],
          title: "Test campaign",
          description: "desc",
          status: "ACTIVE",
          goalAmount: 1000,
        },
      });
      campaignIds.push(campaign.id);
      return campaign;
    }

    afterAll(async () => {
      await prisma.helpContribution.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.helpCampaign.deleteMany({ where: { id: { in: campaignIds } } });
      await prisma.premiumPurchase.deleteMany({ where: { premiumPostId: { in: premiumPostIds } } });
      await prisma.premiumPost.deleteMany({ where: { id: { in: premiumPostIds } } });
      await prisma.tip.deleteMany({ where: { OR: userIds.map((id) => ({ senderId: id })) } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    beforeEach(() => {
      getVerifiedToken.mockReset();
      verifyUsdcTransaction.mockReset();
    });

    // ─── Baseline: a genuine, unique payment succeeds on each route ──

    it("tip: a valid, unique, correctly-amounted payment succeeds", async () => {
      const sender = await createUser("tipsender1");
      const { profile } = await createCreator("tipcreator1");
      const txId = `tx-valid-tip-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", {
          recipientId: profile.userId,
          amount: 10,
          transactionId: txId,
        })
      );
      expect(res.status).toBe(200);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).not.toBeNull();
    });

    // ─── Replay: same account resubmits the same signature ───────────

    it("tip: the SAME account resubmitting the SAME transaction does not receive a second credit", async () => {
      const sender = await createUser("tipsender2");
      const { profile } = await createCreator("tipcreator2");
      const txId = `tx-replay-same-acct-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
      asUser(sender.id);

      const first = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );
      expect(first.status).toBe(200);

      const second = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );
      expect(second.status).toBe(409);

      expect(await prisma.tip.count({ where: { transactionId: txId } })).toBe(1);
    });

    // ─── Replay: a DIFFERENT account tries to claim the same signature ─

    it("tip: a DIFFERENT account cannot claim a transaction another account already used", async () => {
      const original = await createUser("original-claimant");
      const attacker = await createUser("second-claimant");
      const { profile } = await createCreator("tipcreator3");
      const txId = `tx-replay-diff-acct-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));

      asUser(original.id);
      const first = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );
      expect(first.status).toBe(200);

      asUser(attacker.id);
      const second = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );
      expect(second.status).toBe(409);

      expect(await prisma.tip.count({ where: { transactionId: txId } })).toBe(1);
      const savedTip = await prisma.tip.findUnique({ where: { transactionId: txId } });
      expect(savedTip?.senderId).toBe(original.id);
    });

    // ─── Cross-route reuse: the actual confirmed gap ──────────────────
    // A signature consumed as a HELP contribution must not also be
    // claimable as a tip or a premium purchase (and vice versa) - it is
    // the same underlying on-chain payment either way.

    it("cross-route: a transaction consumed as a HELP contribution cannot also be claimed as a tip", async () => {
      const organizer = await createUser("organizer1");
      const campaign = await createCampaign(organizer.id);
      const contributor = await createUser("contributor1");
      const { profile: creatorProfile } = await createCreator("tipcreator-crossroute1");
      const txId = `tx-cross-help-to-tip-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));

      asUser(contributor.id);
      const contributionRes = await contribute(
        req(`https://zrp.one/api/help/${campaign.id}/contribute`, { amount: 10, transactionId: txId }),
        { params: Promise.resolve({ id: campaign.id }) }
      );
      expect(contributionRes.status).toBe(200);

      // Same signature, now aimed at an entirely different product
      // surface (a tip) by an entirely different account.
      const attacker = await createUser("attacker-cross1");
      asUser(attacker.id);
      const tipRes = await tip(
        req("https://zrp.one/api/creator/tip", {
          recipientId: creatorProfile.userId,
          amount: 10,
          transactionId: txId,
        })
      );

      expect(tipRes.status).toBe(409);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
      expect(await prisma.helpContribution.count({ where: { transactionId: txId } })).toBe(1);
    });

    it("cross-route: a transaction consumed as a HELP contribution cannot also be claimed as a premium purchase", async () => {
      const organizer = await createUser("organizer2");
      const campaign = await createCampaign(organizer.id);
      const contributor = await createUser("contributor2");
      const { profile: creatorProfile, user: creatorUser } = await createCreator("premiumcreator-crossroute1");
      const premiumPost = await createPremiumPost(creatorProfile.id, creatorUser.id, 10);
      const txId = `tx-cross-help-to-purchase-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));

      asUser(contributor.id);
      const contributionRes = await contribute(
        req(`https://zrp.one/api/help/${campaign.id}/contribute`, { amount: 10, transactionId: txId }),
        { params: Promise.resolve({ id: campaign.id }) }
      );
      expect(contributionRes.status).toBe(200);

      const attacker = await createUser("attacker-cross2");
      asUser(attacker.id);
      const purchaseRes = await premiumPurchase(
        req("https://zrp.one/api/creator/premium-purchase", {
          premiumPostId: premiumPost.id,
          transactionId: txId,
        })
      );

      expect(purchaseRes.status).toBe(400);
      expect(await prisma.premiumPurchase.findUnique({ where: { transactionId: txId } })).toBeNull();
    });

    it("cross-route: a transaction consumed as a tip cannot also be claimed as a HELP contribution", async () => {
      const sender = await createUser("tipsender-cross3");
      const { profile } = await createCreator("tipcreator-cross3");
      const txId = `tx-cross-tip-to-help-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));

      asUser(sender.id);
      const tipRes = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );
      expect(tipRes.status).toBe(200);

      const organizer = await createUser("organizer3");
      const campaign = await createCampaign(organizer.id);
      const attacker = await createUser("attacker-cross3");
      asUser(attacker.id);
      const contributionRes = await contribute(
        req(`https://zrp.one/api/help/${campaign.id}/contribute`, { amount: 10, transactionId: txId }),
        { params: Promise.resolve({ id: campaign.id }) }
      );

      expect(contributionRes.status).toBe(409);
      expect(await prisma.helpContribution.count({ where: { transactionId: txId } })).toBe(0);
    });

    // ─── Concurrent duplicate claim (race) ────────────────────────────

    // Both race tests below deliberately race two premiumPurchase calls
    // (or one premiumPurchase call against a direct database transaction
    // shaped exactly like tip/route.ts's own write) rather than two real
    // `tip` HTTP calls. tip.ts and the HELP contribute route both
    // dynamically `await import("@/lib/solana")` inside the handler (a
    // deliberate Next.js build-time workaround, see their own comments);
    // under genuine Promise.all concurrency, two such dynamic imports of
    // the same vi.mock'd module are not reliably resolved by Vitest's
    // module runner, and one call can spuriously receive the real,
    // network-blocked module instead of the mock - a test-harness
    // limitation, not an application behavior (production simply serves
    // an already-resolved specifier from Node's module cache, with no
    // concurrent resolution to race). premiumPurchase.ts imports
    // verifyUsdcTransaction statically and is unaffected, so it is the
    // reliable side of both races; the actual security property under
    // test - the shared ConsumedPaymentTransaction table's atomicity -
    // is identical regardless of which route's handler performs the
    // write, since it is enforced by Postgres, not by route-specific code.

    it("concurrent duplicate submissions of the SAME transaction (same route) create only one credit, never two", async () => {
      const sender = await createUser("racer1");
      const { profile: creatorProfile, user: creatorUser } = await createCreator("tipcreator-race1");
      const postA = await createPremiumPost(creatorProfile.id, creatorUser.id, 10);
      const postB = await createPremiumPost(creatorProfile.id, creatorUser.id, 10);
      const txId = `tx-race-same-route-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
      asUser(sender.id);

      // Two distinct posts so only the shared transactionId claim can
      // collide - not the unrelated @@unique([premiumPostId, userId]).
      const [r1, r2] = await Promise.all([
        premiumPurchase(
          req("https://zrp.one/api/creator/premium-purchase", { premiumPostId: postA.id, transactionId: txId })
        ),
        premiumPurchase(
          req("https://zrp.one/api/creator/premium-purchase", { premiumPostId: postB.id, transactionId: txId })
        ),
      ]);

      const statuses = [r1.status, r2.status].sort();
      // Exactly one winner (200) and one clean rejection - never two
      // 200s, and never an unhandled 500 from an uncaught race.
      expect(statuses).toEqual([200, 400]);
      expect(await prisma.premiumPurchase.count({ where: { transactionId: txId } })).toBe(1);
      expect(await prisma.consumedPaymentTransaction.count({ where: { transactionId: txId } })).toBe(1);
    });

    it("concurrent duplicate submissions of the SAME transaction across DIFFERENT payment types create only one credit, never two", async () => {
      const sender = await createUser("racer2");
      const { profile: creatorProfile, user: creatorUser } = await createCreator("tipcreator-race2");
      const premiumPost = await createPremiumPost(creatorProfile.id, creatorUser.id, 10);
      const txId = `tx-race-cross-route-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
      asUser(sender.id);

      // The "other side" of the race is the exact same shape tip/route.ts
      // itself writes (ConsumedPaymentTransaction + Tip in one
      // $transaction) - performed directly here rather than through
      // tip's own dynamic-import HTTP path (see comment above), so this
      // still genuinely races two different payment types against the
      // one real shared constraint.
      const directTipWrite = prisma
        .$transaction([
          prisma.consumedPaymentTransaction.create({
            data: { transactionId: txId, paymentType: "tip", paymentId: randomUUID() },
          }),
          prisma.tip.create({
            data: {
              senderId: sender.id,
              recipientId: creatorProfile.userId,
              creatorProfileId: creatorProfile.id,
              amount: 10,
              transactionId: txId,
              status: "COMPLETED",
            },
          }),
        ])
        .then(() => "won" as const)
        .catch((err) => (err?.code === "P2002" ? ("lost" as const) : Promise.reject(err)));

      const purchaseCall = premiumPurchase(
        req("https://zrp.one/api/creator/premium-purchase", { premiumPostId: premiumPost.id, transactionId: txId })
      );

      const [tipOutcome, purchaseRes] = await Promise.all([directTipWrite, purchaseCall]);

      const succeeded = [tipOutcome === "won", purchaseRes.status === 200].filter(Boolean).length;
      // At most one of the two racing payment types may win - the same
      // signature must never fund both a tip AND a premium purchase.
      expect(succeeded).toBe(1);

      const tipCount = await prisma.tip.count({ where: { transactionId: txId } });
      const purchaseCount = await prisma.premiumPurchase.count({ where: { transactionId: txId } });
      expect(tipCount + purchaseCount).toBe(1);
      expect(await prisma.consumedPaymentTransaction.count({ where: { transactionId: txId } })).toBe(1);
    });

    // ─── Sender binding ────────────────────────────────────────────

    it("sender binding: a verified-wallet account is refused when the on-chain sender doesn't match its linked wallet", async () => {
      const sender = await createUser("boundsender1", "MyLinkedWalletBase58Placeholder1111");
      const { profile } = await createCreator("tipcreator-bind1");
      const txId = `tx-sender-mismatch-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(
        validVerification({ amount: 10, from: "SomeoneElsesWalletBase58Placeholder1" })
      );
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );

      expect(res.status).toBe(400);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
    });

    it("sender binding: a verified-wallet account succeeds when the on-chain sender matches its linked wallet", async () => {
      const wallet = "MyLinkedWalletBase58Placeholder2222";
      const sender = await createUser("boundsender2", wallet);
      const { profile } = await createCreator("tipcreator-bind2");
      const txId = `tx-sender-match-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10, from: wallet }));
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );

      expect(res.status).toBe(200);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).not.toBeNull();
    });

    it("sender binding: an account with NO linked wallet is not blocked by sender mismatch (documented existing payment model, not altered here)", async () => {
      const sender = await createUser("unboundsender1"); // no verifiedSolanaWallet
      const { profile } = await createCreator("tipcreator-bind3");
      const txId = `tx-no-wallet-linked-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(
        validVerification({ amount: 10, from: "AnyWalletAtAllBase58Placeholder33333" })
      );
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );

      expect(res.status).toBe(200);
    });

    // ─── Amount validation ─────────────────────────────────────────

    it("amount: a client-claimed amount that doesn't match the verified on-chain amount is refused", async () => {
      const sender = await createUser("amountmismatch1");
      const { profile } = await createCreator("tipcreator-amount1");
      const txId = `tx-amount-mismatch-${randomUUID()}`;
      // On-chain, only 1 USDC actually moved - client claims 1000.
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 1 }));
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 1000, transactionId: txId })
      );

      expect(res.status).toBe(400);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
    });

    // ─── Malformed / nonexistent transaction ──────────────────────

    it("malformed/nonexistent transaction: a verification failure is a clean 400, not a credited entitlement", async () => {
      const sender = await createUser("badtx1");
      const { profile } = await createCreator("tipcreator-badtx1");
      const txId = `tx-nonexistent-${randomUUID()}`;
      verifyUsdcTransaction.mockRejectedValue(new Error("Transaction not found."));
      asUser(sender.id);

      const res = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );

      expect(res.status).toBe(400);
      expect(await prisma.tip.findUnique({ where: { transactionId: txId } })).toBeNull();
    });

    it("already-consumed transaction: refused before ever calling the blockchain again", async () => {
      const sender = await createUser("consumed1");
      const { profile } = await createCreator("tipcreator-consumed1");
      const txId = `tx-already-consumed-${randomUUID()}`;
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 10 }));
      asUser(sender.id);

      await tip(req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId }));
      verifyUsdcTransaction.mockClear();

      const second = await tip(
        req("https://zrp.one/api/creator/tip", { recipientId: profile.userId, amount: 10, transactionId: txId })
      );

      expect(second.status).toBe(409);
      // The reuse check short-circuits before a second on-chain lookup.
      expect(verifyUsdcTransaction).not.toHaveBeenCalled();
    });
  }
);
