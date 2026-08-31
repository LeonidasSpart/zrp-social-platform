import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // A valid session must contain the database user id.
    // Without it Prisma cannot safely determine which account to update.
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Make sure the authenticated database user still exists.
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        {
          error: "User account no longer exists. Please sign in again.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const {
      name,
      bio,
      location,
      country,
      website,
      category,
      showCategory,
      solanaWallet,
    } = body as {
      name?: unknown;
      bio?: unknown;
      location?: unknown;
      country?: unknown;
      website?: unknown;
      category?: unknown;
      showCategory?: unknown;
      solanaWallet?: unknown;
    };

    // Only update fields explicitly included in the request.
    // This is important because category/showCategory use this same
    // endpoint for small, single-field updates.
    const data: Record<string, unknown> = {};

    if ("name" in body) {
      data.name =
        typeof name === "string" && name.trim()
          ? name.trim()
          : null;
    }

    if ("bio" in body) {
      data.bio =
        typeof bio === "string" && bio.trim()
          ? bio.trim()
          : null;
    }

    if ("location" in body) {
      data.location =
        typeof location === "string" && location.trim()
          ? location.trim()
          : null;
    }

    if ("country" in body) {
      data.country =
        typeof country === "string" && country.trim()
          ? country.trim()
          : null;
    }

    if ("website" in body) {
      data.website =
        typeof website === "string" && website.trim()
          ? website.trim()
          : null;
    }

    if ("category" in body) {
      data.category =
        typeof category === "string" && category.trim()
          ? category.trim()
          : null;
    }

    if ("showCategory" in body) {
      data.showCategory = Boolean(showCategory);
    }

    if ("solanaWallet" in body) {
      const trimmed =
        typeof solanaWallet === "string"
          ? solanaWallet.trim()
          : "";

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

    // Prevent an accidental empty update from silently succeeding.
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No profile fields to update" },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        location: true,
        country: true,
        website: true,
        category: true,
        showCategory: true,
        solanaWallet: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user profile:", error);

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
```
