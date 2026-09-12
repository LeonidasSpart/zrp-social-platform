import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getVerifiedToken, getServerSession } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth-guards", () => ({ getVerifiedToken }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST as createCampaign } from "../route";
import { PUT as updateCampaign } from "../[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Distinct IP per request so /api/help's 5/hour create limiter never
// trips across these test cases.
let ipCounter = 1;
function req(url: string, method: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.8` },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const GOOD_UPLOAD = "https://utfs.io/f/HELPCAMPAIGNKEYaaaaaaaaaaaaaaaaaa";
const BAD_URLS = [
  "https://evil.example/payload.jpg",
  "http://utfs.io/f/plain.jpg",
  "https://localhost/f/x.jpg",
  "https://127.0.0.1/f/x.jpg",
  "https://utfs.io@evil.example/f/x.jpg",
  "javascript:alert(1)",
];

const MEDIA_ERROR = "Media must be uploaded through ZRP or chosen from the GIF picker.";

// needTypes includes MONEY, which POST /api/help requires a goalAmount for -
// that check runs before the media validation being tested here, so every
// fixture needs a valid goalAmount to actually reach the code under test.
const base = {
  category: "EMERGENCY",
  needTypes: ["MONEY"] as const,
  title: "Help needed",
  description: "A real emergency.",
  goalAmount: 1000,
};

/*
 * Regression coverage for the confirmed media-validation gap: HELP
 * campaigns never validated imageUrls/proofUrls on either create or
 * update, unlike every other media-accepting create route (Posts,
 * Marketplace, Music, Stories) - a campaign could point at any
 * attacker-chosen URL.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "HELP campaign media URL validation (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const campaignIds: string[] = [];

    afterAll(async () => {
      await prisma.helpCampaign.deleteMany({ where: { id: { in: campaignIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    // POST /api/help requires a verified-organization badge (see the
    // route's own comment: reuses the Trust Passport signal, not a new
    // verification system) - every fixture here needs it to reach the
    // media validation being tested at all.
    async function createUser(label = "organizer") {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@helpmediatest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`,
          password: "x",
          badgeType: "organization",
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("POST /api/help rejects every untrusted imageUrl/proofUrl at creation", async () => {
      const user = await createUser();
      getVerifiedToken.mockResolvedValue({ id: user.id });
      for (const bad of BAD_URLS) {
        const res = await createCampaign(
          req("https://zrp.one/api/help", "POST", { ...base, imageUrls: [bad] })
        );
        expect(res.status, `imageUrls ${bad}`).toBe(400);
        expect((await res.json()).error, `imageUrls ${bad}`).toBe(MEDIA_ERROR);
        const res2 = await createCampaign(
          req("https://zrp.one/api/help", "POST", { ...base, proofUrls: [bad] })
        );
        expect(res2.status, `proofUrls ${bad}`).toBe(400);
        expect((await res2.json()).error, `proofUrls ${bad}`).toBe(MEDIA_ERROR);
      }
      expect(await prisma.helpCampaign.count({ where: { organizerId: user.id } })).toBe(0);
    });

    it("POST /api/help accepts a real UploadThing URL", async () => {
      const user = await createUser();
      getVerifiedToken.mockResolvedValue({ id: user.id });
      const res = await createCampaign(
        req("https://zrp.one/api/help", "POST", { ...base, imageUrls: [GOOD_UPLOAD], proofUrls: [GOOD_UPLOAD] })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      campaignIds.push(body.campaign.id);
      expect(body.campaign.imageUrls).toEqual([GOOD_UPLOAD]);
    });

    it("PUT /api/help/[id] rejects a new untrusted imageUrl on edit", async () => {
      const user = await createUser("editor1");
      const campaign = await prisma.helpCampaign.create({
        data: { ...base, needTypes: [...base.needTypes], category: "EMERGENCY", organizerId: user.id, imageUrls: [GOOD_UPLOAD] },
      });
      campaignIds.push(campaign.id);
      getServerSession.mockResolvedValue({ user: { id: user.id } });

      for (const bad of BAD_URLS) {
        const res = await updateCampaign(
          req("https://zrp.one/x", "PUT", { imageUrls: [bad] }),
          params(campaign.id)
        );
        expect(res.status, `imageUrls ${bad}`).toBe(400);
        expect((await res.json()).error, `imageUrls ${bad}`).toBe(MEDIA_ERROR);
      }
      const stored = await prisma.helpCampaign.findUnique({ where: { id: campaign.id } });
      expect(stored?.imageUrls).toEqual([GOOD_UPLOAD]);
    });

    it("PUT /api/help/[id] accepts the edit form re-sending the campaign's own already-stored URL", async () => {
      const user = await createUser("editor2");
      const campaign = await prisma.helpCampaign.create({
        data: { ...base, needTypes: [...base.needTypes], category: "EMERGENCY", organizerId: user.id, imageUrls: [GOOD_UPLOAD] },
      });
      campaignIds.push(campaign.id);
      getServerSession.mockResolvedValue({ user: { id: user.id } });

      const res = await updateCampaign(
        req("https://zrp.one/x", "PUT", { title: "Renamed", imageUrls: [GOOD_UPLOAD] }),
        params(campaign.id)
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.campaign.imageUrls).toEqual([GOOD_UPLOAD]);
    });

    it("PUT /api/help/[id] accepts a new, real UploadThing URL replacing the old one", async () => {
      const user = await createUser("editor3");
      const campaign = await prisma.helpCampaign.create({
        data: { ...base, needTypes: [...base.needTypes], category: "EMERGENCY", organizerId: user.id, imageUrls: ["https://utfs.io/f/OLDKEYaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] },
      });
      campaignIds.push(campaign.id);
      getServerSession.mockResolvedValue({ user: { id: user.id } });

      const res = await updateCampaign(
        req("https://zrp.one/x", "PUT", { imageUrls: [GOOD_UPLOAD] }),
        params(campaign.id)
      );
      expect(res.status).toBe(200);
      const stored = await prisma.helpCampaign.findUnique({ where: { id: campaign.id } });
      expect(stored?.imageUrls).toEqual([GOOD_UPLOAD]);
    });
  }
);
