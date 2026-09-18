import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeCountryInput } from "@/lib/geo/country";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 50;

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      bio,
      location,
      country,
      website,
      category,
      showCategory,
      solanaWallet,
      languageCode,
      headline,
      company,
      position,
      skills,
    } = body;

    // Only touch a field if the request actually included it. The main
    // profile-edit form sends name/bio/location/country/website together,
    // while the dedicated category picker and its toggle each send only
    // their own single field - without this check, saving just a category
    // change would wipe bio/name/location/website to null, the same bug
    // class already fixed on post editing earlier this session.
    const data: any = {};
    if ("name" in body) data.name = name || null;
    if ("bio" in body) data.bio = bio || null;
    if ("location" in body) data.location = location || null;
    if ("country" in body) {
      data.country = country || null;
      // Normalize alongside the free-text value every time `country` is
      // written, so `countryCode` (what analytics/ads/feed-ranking
      // actually query) never drifts out of sync with what the user
      // sees in settings. A country ZRP can't confidently normalize
      // (typo, unsupported name) clears countryCode rather than keeping
      // a stale one from a previous value - never guessed, never stale.
      data.countryCode = normalizeCountryInput(country);
    }
    if ("website" in body) data.website = website || null;
    if ("category" in body) data.category = category || null;
    if ("showCategory" in body) data.showCategory = !!showCategory;

    if ("languageCode" in body) {
      const valid = SUPPORTED_LANGUAGES.some((l) => l.code === languageCode);
      data.languageCode = valid ? languageCode : null;
    }

    // ─── Professional profile (Phase 12/14) ───────────────────────
    if ("headline" in body) data.headline = (headline || "").trim().slice(0, 220) || null;
    if ("company" in body) data.company = (company || "").trim().slice(0, 100) || null;
    if ("position" in body) data.position = (position || "").trim().slice(0, 100) || null;
    if ("skills" in body) {
      data.skills = Array.isArray(skills)
        ? Array.from(
            new Set(
              skills
                .filter((s: unknown): s is string => typeof s === "string")
                .map((s: string) => s.trim().slice(0, MAX_SKILL_LENGTH))
                .filter(Boolean)
            )
          ).slice(0, MAX_SKILLS)
        : [];
    }

    if ("solanaWallet" in body) {
      const trimmed = typeof solanaWallet === "string" ? solanaWallet.trim() : "";

      if (trimmed) {
        try {
          new PublicKey(trimmed);
        } catch {
          return NextResponse.json(
            { error: "Invalid Solana wallet address" },
            { status: 400 }
          );
        }
      }

      data.solanaWallet = trimmed || null;
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      username: user.username,
      bio: user.bio,
      location: user.location,
      country: user.country,
      countryCode: user.countryCode,
      website: user.website,
      category: user.category,
      showCategory: user.showCategory,
      solanaWallet: user.solanaWallet,
      languageCode: user.languageCode,
      headline: user.headline,
      company: user.company,
      position: user.position,
      skills: user.skills,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
