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
    const { name, bio, location, country, website } = await req.json();

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: name || null,
        bio: bio || null,
        location: location || null,
        country: country || null,
        website: website || null,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      username: user.username,
      bio: user.bio,
      location: user.location,
      country: user.country,
      website: user.website,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
