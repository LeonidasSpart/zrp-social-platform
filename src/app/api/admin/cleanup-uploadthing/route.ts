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
 * POST -> actually deletes every orphaned file found by the same scan.
 *
 * Restricted to full admins (not moderators) since this is a
 * destructive, irreversible storage operation.
 */

// Every model + field that can hold an UploadThing URL. If a new
// upload surface is added later (another image/video/file field on
// some model), it needs to be added here too, or this tool will think
// those files are orphaned and delete them.
async function collectReferencedKeys(): Promise<Set<string>> {
  const referenced = new Set<string>();

  const addUrl = (url: string | null | undefined) => {
    const key = extractUploadThingKey(url);
    if (key) referenced.add(key);
  };

  const [users, posts, comments, messages, stories, articles] = await Promise.all([
    prisma.user.findMany({ select: { avatarUrl: true, coverUrl: true } }),
    prisma.post.findMany({ select: { imageUrl: true, imageUrls: true } }),
    prisma.comment.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.message.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.story.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.newsArticle.findMany({ where: { coverImage: { not: null } }, select: { coverImage: true } }),
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

  return referenced;
}

async function listAllUploadThingFiles(): Promise<
  { key: string; name: string; size: number; uploadedAt: number | null }[]
> {
  const { UTApi } = await import("uploadthing/server");
  const utapi = new UTApi();

  const all: { key: string; name: string; size: number; uploadedAt: number | null }[] = [];
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
        size: (f as any).size ?? 0,
        uploadedAt: (f as any).uploadedAt ?? null,
      });
    }
    if (!page.hasMore || page.files.length === 0) break;
    offset += pageSize;
  }

  return all;
}

async function findOrphans() {
  const [allFiles, referencedKeys] = await Promise.all([
    listAllUploadThingFiles(),
    collectReferencedKeys(),
  ]);

  const orphans = allFiles.filter((f) => !referencedKeys.has(f.key));
  const orphanedSizeBytes = orphans.reduce((sum, f) => sum + (f.size || 0), 0);

  return {
    totalFilesInUploadThing: allFiles.length,
    totalReferencedInDb: referencedKeys.size,
    orphanedCount: orphans.length,
    orphanedSizeBytes,
    orphanedSizeMB: Math.round((orphanedSizeBytes / (1024 * 1024)) * 100) / 100,
    orphans,
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
      orphanedCount: result.orphanedCount,
      orphanedSizeMB: result.orphanedSizeMB,
      // Capped in the response so a huge orphan list doesn't blow up
      // the payload - the count/size above already reflect the full
      // scan regardless of how many are shown here.
      sample: result.orphans.slice(0, 200),
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
