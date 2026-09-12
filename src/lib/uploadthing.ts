import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { checkVideoSize, checkImagesPerListing } from "./limits";
import { getMusicPublishAccess, MUSIC_PUBLISH_DENIED_MESSAGE } from "./music/permissions";

const f = createUploadthing();

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function isGifFile(file: {
  name?: string;
  type?: string;
}) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  return (
    name.split("?")[0].split("#")[0].endsWith(".gif") ||
    type === "image/gif"
  );
}

function isVideoFile(file: {
  name?: string;
  type?: string;
}) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  /*
   * GIF ALWAYS wins.
   *
   * An animated GIF is still an image for ZRP's
   * normal media system. It must never become a
   * video/Short.
   */
  if (isGifFile(file)) {
    return false;
  }

  if (type.startsWith("video/")) {
    return true;
  }

  const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".3gp",
    ".ogg",
  ];

  return videoExtensions.some((extension) =>
    name.split("?")[0].split("#")[0].endsWith(extension)
  );
}

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".aiff",
  ".aif",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".wma",
];

function isAudioFile(file: {
  name?: string;
  type?: string;
}) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("audio/")) {
    return true;
  }

  return AUDIO_EXTENSIONS.some((extension) =>
    name.split("?")[0].split("#")[0].endsWith(extension)
  );
}

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".gif",
];

function isImageFile(file: {
  name?: string;
  type?: string;
}) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("image/")) {
    return true;
  }

  return IMAGE_EXTENSIONS.some((extension) =>
    name.split("?")[0].split("#")[0].endsWith(extension)
  );
}

// ─────────────────────────────────────────────────────────────
// FILE ROUTER
// ─────────────────────────────────────────────────────────────

export const ourFileRouter = {
  // ───────────────────────────────────────────────────────────
  // POST IMAGE / VIDEO
  // ───────────────────────────────────────────────────────────
  postMedia: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 4,
    },

    /*
     * The router-level cap has to cover every plan (the highest is
     * enterprise at 2048MB) - the actual per-plan limit is enforced
     * below in the middleware via checkVideoSize(), using each
     * user's real plan instead of a single flat number. Without
     * this, a pro/business/enterprise user uploading a video above
     * 32MB but within their plan's advertised limit would have
     * passed the client-side check yet still be rejected here with
     * a generic UploadThing error.
     */
    video: {
      maxFileSize: "2GB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req, files }) => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      const plan =
        session.user.plan || "free";

      for (const file of files) {
        if (
          file.type
            .toLowerCase()
            .startsWith("video/") ||
          isVideoFile(file)
        ) {
          const sizeMB =
            file.size / (1024 * 1024);

          const check =
            checkVideoSize(
              sizeMB,
              plan
            );

          if (!check.allowed) {
            throw new UploadThingError(
              check.message ||
                "Video exceeds your plan's size limit."
            );
          }
        }
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        /*
         * Final upload-level media check.
         *
         * UploadThing has already validated the
         * file category, but we still explicitly
         * detect GIFs here.
         */
        const fileInfo = {
          name: file.name,
          type: file.type,
        };

        if (isGifFile(fileInfo)) {
          console.log(
            "Post GIF uploaded as image:",
            file.ufsUrl
          );

          return {
            url: file.ufsUrl,
            type: "image",
            isGif: true,
          };
        }

        if (isVideoFile(fileInfo)) {
          console.log(
            "Post video uploaded:",
            file.ufsUrl
          );

          return {
            url: file.ufsUrl,
            type: "video",
            isGif: false,
          };
        }

        console.log(
          "Post image uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
          type: "image",
          isGif: false,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // LISTING MEDIA (ZRP Market Plus - marketplace listings)
  // ───────────────────────────────────────────────────────────
  listingMedia: f({
    // Router-level cap covers the highest plan (enterprise, effectively
    // unlimited) - the real per-plan cap is enforced below via
    // checkImagesPerListing(), same split as postMedia's video-size
    // check above.
    image: {
      maxFileSize: "4MB",
      maxFileCount: 15,
    },
    video: {
      maxFileSize: "2GB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ files }) => {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError("Unauthorized");
      }

      const plan = session.user.plan || "free";

      const imageCount = files.filter(
        (file) => !file.type.toLowerCase().startsWith("video/") && !isVideoFile(file)
      ).length;
      if (imageCount > 0) {
        const imagesCheck = checkImagesPerListing(imageCount, plan);
        if (!imagesCheck.allowed) {
          throw new UploadThingError(imagesCheck.message || "Too many images for your plan.");
        }
      }

      for (const file of files) {
        if (file.type.toLowerCase().startsWith("video/") || isVideoFile(file)) {
          const sizeMB = file.size / (1024 * 1024);
          const check = checkVideoSize(sizeMB, plan);
          if (!check.allowed) {
            throw new UploadThingError(check.message || "Video exceeds your plan's size limit.");
          }
        }
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(async ({ file }) => {
      const fileInfo = { name: file.name, type: file.type };

      if (isVideoFile(fileInfo)) {
        console.log("Listing video uploaded:", file.ufsUrl);
        return { url: file.ufsUrl, type: "video" };
      }

      console.log("Listing image uploaded:", file.ufsUrl);
      return { url: file.ufsUrl, type: "image" };
    }),

  // ───────────────────────────────────────────────────────────
  // NEWS COVER IMAGE (ZRP News / Journalist article editor)
  // ───────────────────────────────────────────────────────────
  newsCoverImage: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "News cover image uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // AVATAR
  // ───────────────────────────────────────────────────────────
  avatar: f({
    image: {
      maxFileSize: "2MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Avatar uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // BANNER
  // ───────────────────────────────────────────────────────────
  banner: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Banner uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // CHAT IMAGE
  // ───────────────────────────────────────────────────────────
  chatImage: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Chat image uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // CHAT DOCUMENT
  // ───────────────────────────────────────────────────────────
  chatFile: f({
    pdf: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },

    text: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },

    blob: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Chat document uploaded:",
          file.ufsUrl,
          file.name
        );

        return {
          url: file.ufsUrl,
          name: file.name,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // CHAT AUDIO
  // ───────────────────────────────────────────────────────────
  chatAudio: f({
    audio: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Chat voice message uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // CHAT VIDEO
  // ───────────────────────────────────────────────────────────
  chatVideo: f({
    video: {
      maxFileSize: "32MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        console.log(
          "Chat video uploaded:",
          file.ufsUrl
        );

        return {
          url: file.ufsUrl,
        };
      }
    ),

  // ───────────────────────────────────────────────────────────
  // STORY MEDIA
  // ───────────────────────────────────────────────────────────
  storyMedia: f({
    image: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },

    video: {
      maxFileSize: "16MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session =
        await getServerSession(authOptions);

      if (!session?.user) {
        throw new UploadThingError(
          "Unauthorized"
        );
      }

      return {
        userId: session.user.id,
      };
    })
    .onUploadComplete(
      async ({ metadata, file }) => {
        const fileInfo = {
          name: file.name,
          type: file.type,
        };

        /*
         * GIFs are explicitly returned as images.
         */
        if (isGifFile(fileInfo)) {
          console.log(
            "Story GIF uploaded as image:",
            file.ufsUrl
          );

          return {
            url: file.ufsUrl,
            type: "image",
            isGif: true,
          };
        }

        const type =
          isVideoFile(fileInfo)
            ? "video"
            : "image";

        console.log(
          "Story media uploaded:",
          file.ufsUrl,
          type
        );

        return {
          url: file.ufsUrl,
          type,
          isGif: false,
        };
      }
    ),
  // ─── ZRP MUSIC ─────────────────────────────────────────────
  musicTrack: f({
    audio: { maxFileSize: "512MB", maxFileCount: 1 },
    image: { maxFileSize: "8MB", maxFileCount: 1 },
    // UploadThing decides a file's category from the browser-reported
    // MIME type, falling back to a filename-extension lookup only when
    // that type is completely empty. iOS/iPadOS - especially a file
    // opened via a third-party Files provider or iCloud Drive, and
    // especially for formats Safari doesn't natively decode (FLAC,
    // OGG, sometimes AIFF) - regularly reports a generic type like
    // "application/octet-stream" instead of "audio/...". That's a
    // non-empty string, so UploadThing's own extension fallback never
    // runs, and the upload is rejected client-side before it ever
    // reaches this server. That silent client-side rejection - not
    // the file picker - is the actual root cause behind "we can't
    // reliably upload music." "blob" is UploadThing's catch-all
    // category for exactly this case; the middleware below
    // re-validates every file against real audio/image extensions so
    // this doesn't turn into "upload any file type."
    blob: { maxFileSize: "512MB", maxFileCount: 1 },
  })
    .middleware(async ({ files }) => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");

      // Listening/browsing stays open to everyone, but publishing a
      // track requires an approved Creator status or a verified Music
      // Artist profile. This is derived only from the authenticated
      // session's userId - never from anything the client sends - so
      // it can't be bypassed by a crafted upload request.
      const access = await getMusicPublishAccess(session.user.id);
      if (!access.allowed) {
        throw new UploadThingError(MUSIC_PUBLISH_DENIED_MESSAGE);
      }

      for (const file of files) {
        if (!isAudioFile(file) && !isImageFile(file)) {
          throw new UploadThingError(
            `"${file.name}" isn't a supported audio or image file.`
          );
        }
      }

      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ file }) => ({
      url: file.ufsUrl,
      key: file.key,
      // Same reasoning as isAudioFile/isImageFile above - classify by
      // extension too, not just the (possibly generic) reported type.
      type: isAudioFile(file) ? "audio" : "image",
    })),

} satisfies FileRouter;

export type OurFileRouter =
  typeof ourFileRouter;

// ─────────────────────────────────────────────────────────────
// UPLOADTHING FILE CLEANUP
// ─────────────────────────────────────────────────────────────

export function extractUploadThingKey(
  url: string | null | undefined
): string | null {
  if (!url) return null;

  try {
    const path =
      new URL(url).pathname;

    const segments =
      path
        .split("/")
        .filter(Boolean);

    return (
      segments[
        segments.length - 1
      ] || null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE UPLOADTHING FILES
// ─────────────────────────────────────────────────────────────
//
// A key could reach here more than once - e.g. Post.imageUrl is always
// a copy of Post.imageUrls[0] (see POST /api/posts), so a caller that
// naively collects `[post.imageUrl, ...post.imageUrls]` hands this
// function the exact same key twice for any single-image post. Keys
// are deduplicated (and null/empty entries dropped) up front so a
// caller-side mistake like that can never reach UploadThing as a
// double delete - this is defense-in-depth, not a substitute for
// fixing that mistake at the source (see the Post-deletion routes,
// which now dedupe at collection time too).
//
// UTApi.deleteFiles()'s response is `{ success, deletedCount }` for
// the whole call - confirmed directly against the SDK's wire schema
// (uploadthing/server's DeleteFileResponse), which carries no per-key
// breakdown at all. That means a single batched call for N keys can
// never tell us *which* of them failed, only how many did - so the
// previous version of this function, which resent the entire
// "remaining" batch on retry, was structurally unable to retry just
// the failed ones. Worse, it compared deletedCount against a request
// that could itself contain a duplicate key (see above): UploadThing
// physically deletes one file, deletedCount reflects that one
// deletion, and comparing it against a "remaining" list that (wrongly)
// counted the same key twice made a fully successful deletion look
// like a persistent partial failure forever - this is the exact
// incident this function was rewritten for (Railway log: "0/2 deleted"
// / "keys attempted" showing the same key twice).
//
// So deletion runs one key per UTApi call (bounded concurrency, so a
// large batch - e.g. wiping a power user's whole account - doesn't
// serialize one file at a time or fire an unbounded number of
// simultaneous requests). That costs more HTTP round trips than one
// batched call, but it's the only way this SDK exposes per-key
// results, which is what makes "retry only the keys that actually
// failed" possible at all instead of a guess.
//
// Exported (not just used internally by deleteUploadThingFiles below)
// because the storage cleanup tool (/admin/storage,
// /api/admin/cleanup-uploadthing) already has raw UploadThing keys
// from utapi.listFiles() - it has no URLs to extract keys from, so it
// needs to delete by key directly rather than going through the
// URL-based wrapper.
const DELETE_CONCURRENCY = 8;

// UploadThing keys are opaque identifiers embedded in public file URLs,
// not secrets - but logs are easier to scan, and safer by default,
// when they don't spell out every full key. Truncated for diagnostics
// only; full keys are still used for the actual delete calls.
function truncateKeyForLogging(key: string): string {
  return key.length > 12 ? `${key.slice(0, 8)}…(len ${key.length})` : key;
}

async function deleteKeysOneByOne(
  utapi: InstanceType<typeof import("uploadthing/server").UTApi>,
  targets: string[]
): Promise<string[]> {
  const failed: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const key = targets[cursor++];
      try {
        const result = await utapi.deleteFiles([key]);
        if (!result || result.deletedCount < 1) {
          failed.push(key);
        }
      } catch (error) {
        console.error(`UploadThing deleteFiles threw for key ${truncateKeyForLogging(key)}:`, error);
        failed.push(key);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DELETE_CONCURRENCY, targets.length) }, worker)
  );
  return failed;
}

export async function deleteUploadThingKeys(
  keys: string[]
): Promise<{ requested: number; unique: number; deleted: number; failed: number; retried: number }> {
  const unique = Array.from(
    new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0))
  );

  if (unique.length === 0) {
    return { requested: keys.length, unique: 0, deleted: 0, failed: 0, retried: 0 };
  }

  try {
    const { UTApi } = await import("uploadthing/server");
    const utapi = new UTApi();

    const firstPassFailed = await deleteKeysOneByOne(utapi, unique);

    let finalFailed = firstPassFailed;
    let retried = 0;

    if (firstPassFailed.length > 0) {
      retried = firstPassFailed.length;
      console.error(
        `UploadThing cleanup: ${firstPassFailed.length}/${unique.length} key(s) failed on attempt 1. Retrying only the failed key(s)…`
      );
      finalFailed = await deleteKeysOneByOne(utapi, firstPassFailed);
    }

    const deleted = unique.length - finalFailed.length;

    if (finalFailed.length > 0) {
      console.error(
        "UploadThing cleanup still incomplete after retry - these key(s) were never confirmed deleted:",
        finalFailed.map(truncateKeyForLogging)
      );
    }

    const summary = { requested: keys.length, unique: unique.length, deleted, failed: finalFailed.length, retried };
    const log = summary.failed > 0 ? console.error : console.log;
    log(
      `UploadThing cleanup: requested=${summary.requested} unique=${summary.unique} deleted=${summary.deleted} failed=${summary.failed} retried=${summary.retried}`
    );

    return summary;
  } catch (error) {
    console.error("UploadThing cleanup failed (non-blocking):", error);
    return { requested: keys.length, unique: unique.length, deleted: 0, failed: unique.length, retried: 0 };
  }
}

export async function deleteUploadThingFiles(
  urls: (
    | string
    | null
    | undefined
  )[]
): Promise<void> {
  const keys = urls
    .map((u) =>
      extractUploadThingKey(u)
    )
    .filter(
      (k): k is string =>
        !!k
    );

  await deleteUploadThingKeys(keys);
}
