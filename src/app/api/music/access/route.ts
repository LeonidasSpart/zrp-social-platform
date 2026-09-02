import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMusicPublishAccess } from "@/lib/music/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({
      allowed: false,
      isCreator: false,
      isVerifiedArtist: false,
      hasArtistProfile: false,
      reason: "unauthenticated",
    });
  }

  const access = await getMusicPublishAccess(session.user.id);

  return NextResponse.json({
    allowed: access.allowed,
    isCreator: access.isCreator,
    isVerifiedArtist: access.isVerifiedArtist,
    hasArtistProfile: access.hasArtistProfile,
    reason: access.allowed ? undefined : "not_creator_or_verified",
  });
}
