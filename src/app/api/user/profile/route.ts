import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findExistingSessionUser, ACCOUNT_NOT_FOUND_RESPONSE } from "@/lib/session-user";
import { normalizeCountryInput } from "@/lib/geo/country";
import { normalizeProfileWebsite } from "@/lib/profile-website";

const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 50;

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify that the session user still exists.
    const existingUser = await findExistingSessionUser(session.user.id);

    if (!existingUser) {
      return NextResponse.json(ACCOUNT_NOT_FOUND_RESPONSE, { status: 401 });
    }

    const { name, bio, location, country, website, headline, company, position, skills } =
      await req.json();

    const normalizedWebsite = normalizeProfileWebsite(website);
    if (!normalizedWebsite.ok) {
      return NextResponse.json({ error: normalizedWebsite.error }, { status: 400 });
    }

    const normalizedCountry =
      typeof country === "string" && country.trim() ? country.trim() : null;
    const normalizedSkills = Array.isArray(skills)
      ? Array.from(
          new Set(
            skills
              .filter((s: unknown): s is string => typeof s === "string")
              .map((s: string) => s.trim().slice(0, MAX_SKILL_LENGTH))
              .filter(Boolean)
          )
        ).slice(0, MAX_SKILLS)
      : [];

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name:
          typeof name === "string" && name.trim()
            ? name.trim()
            : null,
        bio:
          typeof bio === "string" && bio.trim()
            ? bio.trim()
            : null,
        location:
          typeof location === "string" && location.trim()
            ? location.trim()
            : null,
        // country/countryCode: same "always write, unconditional null"
        // style as the four fields above (this route's existing
        // convention - the iOS/onboarding caller always sends its full
        // current form state, never a partial patch, unlike PUT
        // /api/user's opt-in "only touch a field if present" style).
        // countryCode is derived the same way PUT /api/user derives it
        // - see src/lib/geo/country.ts.
        country: normalizedCountry,
        countryCode: normalizeCountryInput(normalizedCountry),
        website: normalizedWebsite.value,
        headline:
          typeof headline === "string" && headline.trim()
            ? headline.trim().slice(0, 220)
            : null,
        company:
          typeof company === "string" && company.trim()
            ? company.trim().slice(0, 100)
            : null,
        position:
          typeof position === "string" && position.trim()
            ? position.trim().slice(0, 100)
            : null,
        skills: normalizedSkills,
      },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        location: true,
        country: true,
        countryCode: true,
        website: true,
        headline: true,
        company: true,
        position: true,
        skills: true,
        badgeType: true,
        createdAt: true,
        onboardingCompleted: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
