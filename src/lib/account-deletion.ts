import { prisma } from "@/lib/db";
import { deleteUploadsIfUnreferenced } from "@/lib/upload-ownership";

// The actual, permanent account wipe - shared between the user-triggered
// "delete now" path (src/app/api/user/delete/confirm) and the cron sweep
// that finishes off accounts whose 30-day grace period
// (User.deletionScheduledFor) has passed (src/app/api/cron/delete-scheduled-accounts).
// Both need the exact same two steps in the exact same order: collect
// every file this user's data cascade is about to orphan in UploadThing
// *before* the cascade deletes the rows that reference them, then delete
// the user row itself (every post, message, comment, story, Music
// track/album/artist profile, playlist, Marketplace listing, Help
// campaign, and Opportunity application cascades away via onDelete:
// Cascade in the schema).
export async function deleteUserAccountAndFiles(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const [
    posts,
    comments,
    sentMessages,
    receivedMessages,
    stories,
    musicTracks,
    musicAlbums,
    musicArtist,
    musicPlaylists,
    listings,
    helpCampaigns,
    opportunityApplications,
  ] = await Promise.all([
    prisma.post.findMany({ where: { authorId: userId }, select: { imageUrl: true, imageUrls: true } }),
    prisma.comment.findMany({ where: { authorId: userId, imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.message.findMany({ where: { senderId: userId, imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.message.findMany({ where: { receiverId: userId, imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.story.findMany({ where: { userId, mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.musicTrack.findMany({ where: { artist: { userId } }, select: { audioUrl: true, coverUrl: true } }),
    prisma.musicAlbum.findMany({ where: { artist: { userId }, coverUrl: { not: null } }, select: { coverUrl: true } }),
    prisma.musicArtist.findUnique({ where: { userId }, select: { avatarUrl: true, bannerUrl: true } }),
    prisma.musicPlaylist.findMany({ where: { userId, coverUrl: { not: null } }, select: { coverUrl: true } }),
    prisma.listing.findMany({ where: { sellerId: userId }, select: { imageUrls: true, videoUrl: true } }),
    prisma.helpCampaign.findMany({ where: { organizerId: userId }, select: { imageUrls: true, proofUrls: true } }),
    prisma.opportunityApplication.findMany({ where: { applicantId: userId, resumeUrl: { not: null } }, select: { resumeUrl: true } }),
  ]);

  await prisma.user.delete({ where: { id: userId } });

  // p.imageUrl is always a copy of p.imageUrls[0] (see POST /api/posts)
  // - deleteUploadsIfUnreferenced dedupes that and skips anything still
  // referenced by another row before deleting.
  await deleteUploadsIfUnreferenced([
    user.avatarUrl,
    user.coverUrl,
    ...posts.flatMap((p) => [p.imageUrl, ...p.imageUrls]),
    ...comments.map((c) => c.imageUrl),
    ...sentMessages.map((m) => m.imageUrl),
    ...receivedMessages.map((m) => m.imageUrl),
    ...stories.map((s) => s.mediaUrl),
    ...musicTracks.flatMap((t) => [t.audioUrl, t.coverUrl]),
    ...musicAlbums.map((a) => a.coverUrl),
    musicArtist?.avatarUrl,
    musicArtist?.bannerUrl,
    ...musicPlaylists.map((p) => p.coverUrl),
    ...listings.flatMap((l) => [...l.imageUrls, l.videoUrl]),
    ...helpCampaigns.flatMap((c) => [...c.imageUrls, ...c.proofUrls]),
    ...opportunityApplications.map((a) => a.resumeUrl),
  ]);
}
