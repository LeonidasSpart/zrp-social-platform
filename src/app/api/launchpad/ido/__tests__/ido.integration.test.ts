import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/*
 * Integration coverage for ZRP Launchpad phase 9 (IDO scaffolding)
 * against a real Postgres. There is no Solana RPC call anywhere in this
 * phase - it's deliberately non-custodial (see IdoCampaign's schema doc
 * comment), so nothing here needs mocking beyond auth.
 */
const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});

import { prisma } from "@/lib/db";
import { POST as createCampaign } from "../route";
import { GET as getCampaign } from "../[id]/route";
import { POST as applyForWhitelist, GET as listApplications } from "../[id]/applications/route";
import { POST as reviewApplication } from "../[id]/applications/[appId]/review/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.31`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function campaignBody(launchedTokenId: string, overrides: Record<string, unknown> = {}) {
  return {
    launchedTokenId,
    title: "Test IDO",
    description: "A test sale.",
    tokenPriceUsdc: "0.05",
    softCapUsdc: "10000",
    hardCapUsdc: "50000",
    participationInstructions: "Approved participants will receive a contribution wallet address via email - off-platform.",
    saleStartsAt: new Date(Date.now() + 3600_000).toISOString(),
    saleDurationDays: 7,
    ...overrides,
  };
}

describe.skipIf(!hasRealDatabaseUrl)("IDO launchpad scaffolding (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const campaignIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@idotest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createLaunchedToken(creatorId: string) {
    const token = await prisma.launchedToken.create({
      data: {
        name: "IDO Token",
        symbol: "IDOT",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: `MintIdo${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  afterAll(async () => {
    await prisma.idoWhitelistApplication.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.idoCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
  });

  it("rejects campaign creation from someone other than the token's creator (403)", async () => {
    const owner = await createUser("idotokenowner1");
    const idoToken = await createLaunchedToken(owner.id);
    const stranger = await createUser("idostranger1");
    asUser(stranger.id);

    const res = await createCampaign(req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id)));
    expect(res.status).toBe(403);
  });

  it("rejects a hard cap below the soft cap (400)", async () => {
    const owner = await createUser("idotokenowner2");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);

    const res = await createCampaign(
      req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id, { softCapUsdc: "50000", hardCapUsdc: "10000" }))
    );
    expect(res.status).toBe(400);
  });

  it("happy path: the token's creator opens an IDO campaign, and the fractional USDC price/caps survive the API round trip exactly", async () => {
    const owner = await createUser("idotokenowner3");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);

    const res = await createCampaign(
      req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id, { tokenPriceUsdc: "0.123456", softCapUsdc: "10000.5" }))
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    // Would be silently truncated to 0 by the raw-base-unit serializer
    // (jsonWithDecimalStrings' toFixed(0)) - this is the exact Phase 5
    // admin-dashboard bug class, guarded against here.
    expect(data.campaign.tokenPriceUsdc).toBeCloseTo(0.123456, 6);
    expect(data.campaign.softCapUsdc).toBeCloseTo(10000.5, 2);
    campaignIds.push(data.campaign.id);

    const detailRes = await getCampaign(new NextRequest(`https://zrp.one/api/launchpad/ido/${data.campaign.id}`), {
      params: Promise.resolve({ id: data.campaign.id }),
    });
    const detail = await detailRes.json();
    expect(detail.campaign.tokenPriceUsdc).toBeCloseTo(0.123456, 6);
  });

  it("accepts a wallet-native whitelist application with no ZRP session, and rejects a duplicate application from the same wallet (409)", async () => {
    const owner = await createUser("idotokenowner4");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);
    const campaignRes = await createCampaign(req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id)));
    const { campaign } = await campaignRes.json();
    campaignIds.push(campaign.id);

    const applicantWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    const applyRes = await applyForWhitelist(
      req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`, { walletAddress: applicantWallet, contactEmail: "a@example.com" }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(applyRes.status).toBe(201);

    const dupeRes = await applyForWhitelist(
      req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`, { walletAddress: applicantWallet }),
      { params: Promise.resolve({ id: campaign.id }) }
    );
    expect(dupeRes.status).toBe(409);
  });

  it("rejects listing applications from anyone other than the campaign's creator (403), then succeeds for the creator", async () => {
    const owner = await createUser("idotokenowner5");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);
    const campaignRes = await createCampaign(req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id)));
    const { campaign } = await campaignRes.json();
    campaignIds.push(campaign.id);

    const applicantWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    await applyForWhitelist(req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`, { walletAddress: applicantWallet }), {
      params: Promise.resolve({ id: campaign.id }),
    });

    const stranger = await createUser("idostranger2");
    asUser(stranger.id);
    const strangerRes = await listApplications(new NextRequest(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(strangerRes.status).toBe(403);

    asUser(owner.id);
    const ownerRes = await listApplications(new NextRequest(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(ownerRes.status).toBe(200);
    const { applications } = await ownerRes.json();
    expect(applications).toHaveLength(1);
    expect(applications[0].applicantWalletAddress).toBe(applicantWallet);
  });

  it("rejects reviewing an application from anyone other than the campaign's creator (403), then approves it for the creator", async () => {
    const owner = await createUser("idotokenowner6");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);
    const campaignRes = await createCampaign(req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id)));
    const { campaign } = await campaignRes.json();
    campaignIds.push(campaign.id);

    const applicantWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    const applyRes = await applyForWhitelist(req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`, { walletAddress: applicantWallet }), {
      params: Promise.resolve({ id: campaign.id }),
    });
    const { application } = await applyRes.json();

    const stranger = await createUser("idostranger3");
    asUser(stranger.id);
    const strangerReview = await reviewApplication(
      req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications/${application.id}/review`, { status: "APPROVED" }),
      { params: Promise.resolve({ id: campaign.id, appId: application.id }) }
    );
    expect(strangerReview.status).toBe(403);

    asUser(owner.id);
    const ownerReview = await reviewApplication(
      req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications/${application.id}/review`, { status: "APPROVED", reviewNote: "Looks good." }),
      { params: Promise.resolve({ id: campaign.id, appId: application.id }) }
    );
    expect(ownerReview.status).toBe(200);
    const { application: reviewed } = await ownerReview.json();
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.reviewedAt).not.toBeNull();
  });

  it("rejects a whitelist application once the sale has ended (400)", async () => {
    const owner = await createUser("idotokenowner7");
    const idoToken = await createLaunchedToken(owner.id);
    asUser(owner.id);
    const campaignRes = await createCampaign(req("https://zrp.one/api/launchpad/ido", campaignBody(idoToken.id)));
    const { campaign } = await campaignRes.json();
    campaignIds.push(campaign.id);

    await prisma.idoCampaign.update({ where: { id: campaign.id }, data: { saleEndsAt: new Date(Date.now() - 1000) } });

    const applicantWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    const res = await applyForWhitelist(req(`https://zrp.one/api/launchpad/ido/${campaign.id}/applications`, { walletAddress: applicantWallet }), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(res.status).toBe(400);
  });
});
