import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { extractUploadThingKey, deleteUploadThingKeys } from "@/lib/uploadthing";

/**
 * Finds every file currently sitting in UploadThing storage that is no
 * longer referenced anywhere in the database - the accumulated result
 * of the partial-delete bug fixed in deleteUploadThingFiles(), plus
 * anything else that ever slipped through before that fix existed.
 *
 * GET  -> dry run. Lists what WOULD be deleted, with a total size, and
 *         changes nothing. Safe to call as often as you like.
 * POST -> actually deletes every orphaned file eligible for deletion
 *         (same set GET reports as "orphaned" - see the grace-period
 *         note below for what's held back).
 *
 * Restricted to full admins (not moderators) since this is a
 * destructive, irreversible storage operation.
 */

// A file only just uploaded and not yet referenced anywhere in the
// database is NOT necessarily orphaned - every upload flow in this
// app is two steps (UploadThing upload completes, THEN a follow-up
// API call creates the database record that references it: see
// POST /api/music/tracks, listing/campaign creation, etc.). A cleanup
// run landing in that gap would delete a file the user is actively in
// the middle of publishing. Anything younger than this is held back
// and reported separately rather than deleted, per "prefer safe
// retention over risky deletion."
const ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

// Every model + field that can hold an UploadThing URL (or, for
// MusicTrack.audioKey, a raw UploadThing key). If a new upload
// surface is added later, it needs an entry here too, or this tool
// will think those files are orphaned and delete them.
//
// Cross-reference against every route in `ourFileRouter`
// (src/lib/uploadthing.ts) - each one must have its consuming
// model/field(s) listed below:
//   postMedia       -> Post.imageUrl, Post.imageUrls
//   listingMedia     -> Listing.imageUrls, Listing.videoUrl,
//                        HelpCampaign.imageUrls, HelpCampaign.proofUrls
//                        (HELP campaign creation reuses this route)
//   newsCoverImage   -> NewsArticle.coverImage
//   avatar           -> User.avatarUrl
//   banner           -> User.coverUrl
//   chatImage/File/
//   Audio/Video      -> Message.imageUrl (one field holds every chat
//                        attachment type - see ChatInterface.tsx),
//                        OpportunityApplication.resumeUrl (application
//                        forms reuse the chatFile route for resumes)
//   storyMedia       -> Story.mediaUrl
//   musicTrack       -> MusicTrack.audioUrl, MusicTrack.audioKey,
//                        MusicTrack.coverUrl, MusicArtist.avatarUrl,
//                        MusicArtist.bannerUrl, MusicAlbum.coverUrl,
//                        MusicPlaylist.coverUrl
async function collectReferencedKeys(): Promise<Set<string>> {
  const referenced = new Set<string>();

  const addUrl = (url: string | null | undefined) => {
    const key = extractUploadThingKey(url);
    if (key) referenced.add(key);
  };
  const addKey = (key: string | null | undefined) => {
    if (key) referenced.add(key);
  };

  const [
    users,
    posts,
    comments,
    messages,
    stories,
    articles,
    opportunityApplications,
    listings,
    helpCampaigns,
    musicArtists,
    musicAlbums,
    musicTracks,
    musicPlaylists,
  ] = await Promise.all([
    prisma.user.findMany({ select: { avatarUrl: true, coverUrl: true } }),
    prisma.post.findMany({ select: { imageUrl: true, imageUrls: true } }),
    prisma.comment.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.message.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.story.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.newsArticle.findMany({ where: { coverImage: { not: null } }, select: { coverImage: true } }),
    prisma.opportunityApplication.findMany({
      where: { resumeUrl: { not: null } },
      select: { resumeUrl: true },
    }),
    prisma.listing.findMany({ select: { imageUrls: true, videoUrl: true } }),
    prisma.helpCampaign.findMany({ select: { imageUrls: true, proofUrls: true } }),
    prisma.musicArtist.findMany({ select: { avatarUrl: true, bannerUrl: true } }),
    prisma.musicAlbum.findMany({ select: { coverUrl: true } }),
    prisma.musicTrack.findMany({ select: { audioUrl: true, audioKey: true, coverUrl: true } }),
    prisma.musicPlaylist.findMany({ where: { coverUrl: { not: null } }, select: { coverUrl: true } }),
  ]);

  users.forEach((u) => {
    addUrl(u.avatarUrl);
    addUrl(u.coverUrl);
  });
  posts.forEach((p) => {
    addUrl(p.imageUrl);
    p.imageUrls.forEach(addUrl);
  });
  comments.forEach((c) => addUrl(c.imageUrl));
  messages.forEach((m) => addUrl(m.imageUrl));
  stories.forEach((s) => addUrl(s.mediaUrl));
  articles.forEach((a) => addUrl(a.coverImage));
  opportunityApplications.forEach((a) => addUrl(a.resumeUrl));
  listings.forEach((l) => {
    l.imageUrls.forEach(addUrl);
    addUrl(l.videoUrl);
  });
  helpCampaigns.forEach((c) => {
    c.imageUrls.forEach(addUrl);
    c.proofUrls.forEach(addUrl);
  });
  musicArtists.forEach((a) => {
    addUrl(a.avatarUrl);
    addUrl(a.bannerUrl);
  });
  musicAlbums.forEach((a) => addUrl(a.coverUrl));
  musicTracks.forEach((t) => {
    addUrl(t.audioUrl);
    addKey(t.audioKey);
    addUrl(t.coverUrl);
  });
  musicPlaylists.forEach((p) => addUrl(p.coverUrl));

  return referenced;
}

type UploadThingFile = {
  key: string;
  name: string;
  size: number;
  uploadedAt: number;
  status: "Deletion Pending" | "Failed" | "Uploaded" | "Uploading";
};

async function listAllUploadThingFiles(): Promise<UploadThingFile[]> {
  const { UTApi } = await import("uploadthing/server");
  const utapi = new UTApi();

  const all: UploadThingFile[] = [];
  let offset = 0;
  const pageSize = 500;

  // listFiles paginates - keep pulling pages until UploadThing says
  // there's nothing left.
  while (true) {
    const page = await utapi.listFiles({ limit: pageSize, offset });
    for (const f of page.files) {
      all.push({
        key: f.key,
        name: f.name,
        size: f.size,
        uploadedAt: f.uploadedAt,
        status: f.status,
      });
    }
    if (!page.hasMore || page.files.length === 0) break;
    offset += pageSize;
  }

  return all;
}

function sizeOf(files: UploadThingFile[]) {
  const bytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  return { bytes, mb: Math.round((bytes / (1024 * 1024)) * 100) / 100 };
}

async function findOrphans() {
  const [allFiles, referencedKeys] = await Promise.all([
    listAllUploadThingFiles(),
    collectReferencedKeys(),
  ]);

  // Files still mid-upload, failed, or already being torn down by
  // UploadThing itself are never "orphaned" in the sense this tool
  // cares about - they're not a finished, referenceable file at all.
  const consideredFiles = allFiles.filter((f) => f.status === "Uploaded");
  const nonUploadedStatusCount = allFiles.length - consideredFiles.length;

  const unreferenced = consideredFiles.filter((f) => !referencedKeys.has(f.key));

  const now = Date.now();
  const eligible = unreferenced.filter((f) => now - f.uploadedAt >= ORPHAN_GRACE_PERIOD_MS);
  const heldForReview = unreferenced.filter((f) => now - f.uploadedAt < ORPHAN_GRACE_PERIOD_MS);

  return {
    totalFilesInUploadThing: allFiles.length,
    totalReferencedInDb: referencedKeys.size,
    nonUploadedStatusCount,
    orphanedCount: eligible.length,
    orphanedSizeMB: sizeOf(eligible).mb,
    orphans: eligible,
    heldForReviewCount: heldForReview.length,
    heldForReviewSizeMB: sizeOf(heldForReview).mb,
    heldForReview,
  };
}

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const result = await findOrphans();

    return NextResponse.json({
      success: true,
      dryRun: true,
      totalFilesInUploadThing: result.totalFilesInUploadThing,
      totalReferencedInDb: result.totalReferencedInDb,
      nonUploadedStatusCount: result.nonUploadedStatusCount,
      orphanedCount: result.orphanedCount,
      orphanedSizeMB: result.orphanedSizeMB,
      heldForReviewCount: result.heldForReviewCount,
      heldForReviewSizeMB: result.heldForReviewSizeMB,
      // Capped in the response so a huge orphan list doesn't blow up
      // the payload - the count/size above already reflect the full
      // scan regardless of how many are shown here.
      sample: result.orphans.slice(0, 200),
      heldForReviewSample: result.heldForReview.slice(0, 50),
    });
  } catch (error) {
    console.error("cleanup-uploadthing GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to scan UploadThing storage" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const result = await findOrphans();
    // Only ever delete the eligible set - never anything held back for
    // review by the grace period, and never anything with a
    // non-"Uploaded" status.
    const keys = result.orphans.map((f) => f.key);

    // Delete in chunks rather than one giant request - keeps each
    // batch call to UploadThing reasonably sized and means a failure
    // partway through doesn't lose progress on everything already
    // confirmed deleted.
    const chunkSize = 500;
    let deleted = 0;

    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const outcome = await deleteUploadThingKeys(chunk);
      deleted += outcome.deleted;
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      orphanedCount: result.orphanedCount,
      orphanedSizeMB: result.orphanedSizeMB,
      heldForReviewCount: result.heldForReviewCount,
      deleted,
    });
  } catch (error) {
    console.error("cleanup-uploadthing POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clean up UploadThing storage" },
      { status: 500 }
    );
  }
}
