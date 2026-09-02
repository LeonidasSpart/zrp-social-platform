import { prisma } from "@/lib/db";

export type MusicPublishAccess = {
  allowed: boolean;
  isCreator: boolean;
  isVerifiedArtist: boolean;
  hasArtistProfile: boolean;
  artistId: string | null;
};

/**
 * Publishing (Music Studio upload + track creation) is gated on the
 * authenticated user having an approved CreatorProfile OR an already
 * verified MusicArtist profile. Both signals come straight from the
 * database keyed by the session's userId - never from client input -
 * so this is safe to call from both the UploadThing middleware and the
 * POST /api/music/tracks handler as the single source of truth.
 */
export async function getMusicPublishAccess(userId: string): Promise<MusicPublishAccess> {
  const [creatorProfile, artist] = await Promise.all([
    prisma.creatorProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.musicArtist.findUnique({ where: { userId }, select: { id: true, verified: true } }),
  ]);

  const isCreator = !!creatorProfile;
  const isVerifiedArtist = !!artist?.verified;

  return {
    allowed: isCreator || isVerifiedArtist,
    isCreator,
    isVerifiedArtist,
    hasArtistProfile: !!artist,
    artistId: artist?.id ?? null,
  };
}

export const MUSIC_PUBLISH_DENIED_MESSAGE =
  "Publishing music requires an approved Creator status or a verified Music Artist profile.";
