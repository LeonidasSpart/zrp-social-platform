import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { deleteUploadThingKeys, extractUploadThingKey } from "./uploadthing";

/*
 * ============================================================
 * Upload ownership guard for storage deletion
 * ============================================================
 *
 * ⚠️ SECURITY: an UploadThing URL is public the moment it is rendered
 * anywhere in ZRP (an avatar, a post image, a chat attachment). Story,
 * music and marketplace records used to accept ANY such URL from the
 * client - and deleting a track, album or listing then deleted its
 * media from storage unconditionally. So User A could attach User B's
 * file to a track or listing of their own, delete it, and destroy B's
 * file for everyone. The music routes even accepted a raw `audioKey` /
 * `coverKey` from the client, which was then handed straight to
 * UTApi.deleteFiles().
 *
 * There is no per-upload ownership table (and this hardening adds no
 * schema), so ownership is enforced the way the storage-cleanup tool
 * already reasons about files: a key is only deleted from storage when
 * NOTHING in the database still references it. The record being
 * deleted is removed first, so anything still referencing the key
 * afterwards belongs to someone or something else and the file stays.
 *
 * The check is by KEY, not by exact URL string, so an attacker can't
 * dodge it by attaching the same file under an alternate host or path
 * form (utfs.io vs <app>.ufs.sh, /f/<key> vs /a/<app>/<key>).
 */

// Every model + text column that can hold an UploadThing URL. Kept in
// step with collectReferencedKeys() in
// src/app/api/admin/cleanup-uploadthing/route.ts.
async function isKeyReferencedInTextColumns(key: string): Promise<boolean> {
  const c = { contains: key } as const;
  const checks = await Promise.all([
    prisma.user.findFirst({ where: { OR: [{ avatarUrl: c }, { coverUrl: c }] }, select: { id: true } }),
    prisma.post.findFirst({ where: { imageUrl: c }, select: { id: true } }),
    prisma.comment.findFirst({ where: { imageUrl: c }, select: { id: true } }),
    prisma.message.findFirst({ where: { imageUrl: c }, select: { id: true } }),
    prisma.story.findFirst({ where: { mediaUrl: c }, select: { id: true } }),
    prisma.newsArticle.findFirst({ where: { coverImage: c }, select: { id: true } }),
    prisma.opportunityApplication.findFirst({ where: { resumeUrl: c }, select: { id: true } }),
    prisma.listing.findFirst({ where: { videoUrl: c }, select: { id: true } }),
    prisma.musicArtist.findFirst({ where: { OR: [{ avatarUrl: c }, { bannerUrl: c }] }, select: { id: true } }),
    prisma.musicAlbum.findFirst({ where: { OR: [{ coverUrl: c }, { coverKey: key }] }, select: { id: true } }),
    prisma.musicTrack.findFirst({
      where: { OR: [{ audioUrl: c }, { coverUrl: c }, { audioKey: key }, { coverKey: key }] },
      select: { id: true },
    }),
    prisma.musicPlaylist.findFirst({ where: { coverUrl: c }, select: { id: true } }),
    prisma.conversation.findFirst({ where: { avatarUrl: c }, select: { id: true } }),
  ]);
  return checks.some((row) => row !== null);
}

// String[] columns can't be searched with Prisma's `contains`, so these
// are read-only parameterised queries (no interpolation of the key).
async function isKeyReferencedInArrayColumns(key: string): Promise<boolean> {
  const pattern = `%${key}%`;
  const [posts, listings, campaigns] = await Promise.all([
    prisma.$queryRaw<{ found: number }[]>(
      Prisma.sql`SELECT 1 AS found FROM "Post" WHERE EXISTS (SELECT 1 FROM unnest("imageUrls") AS u WHERE u LIKE ${pattern}) LIMIT 1`
    ),
    prisma.$queryRaw<{ found: number }[]>(
      Prisma.sql`SELECT 1 AS found FROM "Listing" WHERE EXISTS (SELECT 1 FROM unnest("imageUrls") AS u WHERE u LIKE ${pattern}) LIMIT 1`
    ),
    prisma.$queryRaw<{ found: number }[]>(
      Prisma.sql`SELECT 1 AS found FROM "HelpCampaign" WHERE EXISTS (SELECT 1 FROM unnest("imageUrls") AS u WHERE u LIKE ${pattern}) OR EXISTS (SELECT 1 FROM unnest("proofUrls") AS u WHERE u LIKE ${pattern}) LIMIT 1`
    ),
  ]);
  return posts.length > 0 || listings.length > 0 || campaigns.length > 0;
}

/** True when any database row still references this upload key. */
export async function isUploadKeyReferenced(key: string): Promise<boolean> {
  if (!key) return false;
  const [inText, inArrays] = await Promise.all([
    isKeyReferencedInTextColumns(key),
    isKeyReferencedInArrayColumns(key),
  ]);
  return inText || inArrays;
}

/**
 * Delete the given upload URLs/keys from storage - but only those no
 * longer referenced by any row. Call AFTER the owning record has been
 * deleted. Returns the keys actually handed to storage for deletion
 * and the keys kept because something else still uses them.
 */
export async function deleteUploadsIfUnreferenced(
  refs: readonly (string | null | undefined)[]
): Promise<{ deleted: string[]; kept: string[] }> {
  const keys = Array.from(
    new Set(
      refs
        .map((ref) => (ref && /^https?:\/\//i.test(ref) ? extractUploadThingKey(ref) : ref))
        .filter((k): k is string => typeof k === "string" && k.length > 0)
    )
  );
  if (keys.length === 0) return { deleted: [], kept: [] };

  const referenced = await Promise.all(keys.map((k) => isUploadKeyReferenced(k)));
  const deleted = keys.filter((_, i) => !referenced[i]);
  const kept = keys.filter((_, i) => referenced[i]);

  if (deleted.length > 0) {
    await deleteUploadThingKeys(deleted);
  }
  return { deleted, kept };
}
