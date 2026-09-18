import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});

import { prisma } from "@/lib/db";
import { GET } from "../serve/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * Regression test for the countryCode-vs-country targeting bug fixed in
 * this mission: GET /api/ads/serve used to match AdCampaign.targetCountries
 * (ISO codes) against the free-text User.country field, which would
 * silently never match for real profiles ("Switzerland" != "CH"). It now
 * matches against the normalized User.countryCode instead.
 */
describe.skipIf(!hasRealDatabaseUrl)("GET /api/ads/serve - country targeting (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const campaignIds: string[] = [];
  const postIds: string[] = [];

  afterAll(async () => {
    await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } }).catch(() => {});
    await prisma.post.deleteMany({ where: { id: { in: postIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  });

  async function makeCampaign(advertiserId: string, targetCountries: string[]) {
    const post = await prisma.post.create({
      data: { content: `geo-ads-test-${runId}`, authorId: advertiserId },
    });
    postIds.push(post.id);
    const campaign = await prisma.adCampaign.create({
      data: {
        advertiserId,
        postId: post.id,
        name: `geo-ads-test-campaign-${runId}`,
        targetUrl: "https://example.com",
        status: "ACTIVE",
        bidType: "CPM",
        bidAmount: 1,
        budgetTotal: 100,
        budgetSpent: 0,
        targetCountries,
      },
    });
    campaignIds.push(campaign.id);
    return campaign;
  }

  it("matches a viewer with a real countryCode against targetCountries (ISO codes), never the free-text country", async () => {
    const advertiser = await prisma.user.create({
      data: { email: `ads-advertiser-${runId}@example.com`, username: `ads_adv_${runId}`, password: "x" },
    });
    userIds.push(advertiser.id);

    // The exact case that used to break: a free-text `country` of
    // "Switzerland" alongside the correct normalized `countryCode` "CH".
    // Before the fix, this route compared `targetCountries` against
    // `country` and would never have matched "CH".
    const viewer = await prisma.user.create({
      data: {
        email: `ads-viewer-ch-${runId}@example.com`,
        username: `ads_view_ch_${runId}`,
        password: "x",
        country: "Switzerland",
        countryCode: "CH",
      },
    });
    userIds.push(viewer.id);

    const chCampaign = await makeCampaign(advertiser.id, ["CH"]);

    getVerifiedToken.mockResolvedValueOnce({ id: viewer.id });
    const res = await GET(new NextRequest("https://zrp.one/api/ads/serve"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ad).not.toBeNull();
    expect(body.ad.campaignId).toBe(chCampaign.id);
  });

  it("never serves a campaign targeted at a different country to this viewer", async () => {
    const advertiser = await prisma.user.create({
      data: { email: `ads-advertiser2-${runId}@example.com`, username: `ads_adv2_${runId}`, password: "x" },
    });
    userIds.push(advertiser.id);

    const viewer = await prisma.user.create({
      data: {
        email: `ads-viewer-fr-${runId}@example.com`,
        username: `ads_view_fr_${runId}`,
        password: "x",
        countryCode: "FR",
      },
    });
    userIds.push(viewer.id);

    await makeCampaign(advertiser.id, ["DE"]);

    getVerifiedToken.mockResolvedValueOnce({ id: viewer.id });
    const res = await GET(new NextRequest("https://zrp.one/api/ads/serve"));
    const body = await res.json();
    // Either null (no eligible ad) or, if some other untargeted campaign
    // exists from a prior test run, definitely not the DE-only one.
    if (body.ad) {
      expect(body.ad.campaignId).not.toBe(campaignIds[campaignIds.length - 1]);
    }
  });

  it("shows an untargeted campaign (empty targetCountries) to any viewer, including logged-out", async () => {
    const advertiser = await prisma.user.create({
      data: { email: `ads-advertiser3-${runId}@example.com`, username: `ads_adv3_${runId}`, password: "x" },
    });
    userIds.push(advertiser.id);

    const untargeted = await makeCampaign(advertiser.id, []);

    getVerifiedToken.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("https://zrp.one/api/ads/serve"));
    const body = await res.json();
    expect(body.ad).not.toBeNull();
    expect(body.ad.campaignId).toBe(untargeted.id);
  });
});
