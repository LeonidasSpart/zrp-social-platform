import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, bio, location, country, website, category, showCategory } = body;

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
    if ("country" in body) data.country = country || null;
    if ("website" in body) data.website = website || null;
    if ("category" in body) data.category = category || null;
    if ("showCategory" in body) data.showCategory = !!showCategory;

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
      website: user.website,
      category: user.category,
      showCategory: user.showCategory,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
