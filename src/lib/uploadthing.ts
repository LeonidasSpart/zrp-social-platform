import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { checkVideoSize, checkImagesPerListing } from "./limits";

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
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ file }) => ({
      url: file.ufsUrl,
      key: file.key,
      type: file.type.startsWith("audio/") ? "audio" : "image",
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
// UTApi.deleteFiles() does NOT throw when only some keys in a batch
// actually get deleted - it resolves with { success, deletedCount }
// even on a partial failure. The previous version of this function
// awaited the call and never looked at that return value, so e.g.
// deleting a 4-image post could silently delete only 1 of the 4 files
// from UploadThing with zero error, zero log line, nothing - the
// other 3 just sat there forever. This now checks deletedCount against
// what was requested, retries once (a single retry is usually enough
// for the transient batch hiccups that cause this), and - critically -
// actually logs when files are still left over after that, so a
// standing gap is visible instead of invisible.
//
// Exported (not just used internally by deleteUploadThingFiles below)
// because the storage cleanup tool (/admin/storage,
// /api/admin/cleanup-uploadthing) already has raw UploadThing keys
// from utapi.listFiles() - it has no URLs to extract keys from, so it
// needs to delete by key directly rather than going through the
// URL-based wrapper.
export async function deleteUploadThingKeys(
  keys: string[]
): Promise<{ requested: number; deleted: number }> {
  if (keys.length === 0) {
    return { requested: 0, deleted: 0 };
  }

  try {
    const { UTApi } =
      await import(
        "uploadthing/server"
      );

    const utapi = new UTApi();

    let remaining = keys;
    let deleted = 0;

    for (let attempt = 1; attempt <= 2 && remaining.length > 0; attempt++) {
      let result: { success: boolean; deletedCount: number } | undefined;

      try {
        result = await utapi.deleteFiles(remaining);
      } catch (error) {
        console.error(
          `UploadThing deleteFiles threw on attempt ${attempt} (${remaining.length} key(s)):`,
          error
        );
        if (attempt === 2) {
          console.error(
            "UploadThing cleanup incomplete after retry - these keys were never confirmed deleted:",
            remaining
          );
        }
        continue;
      }

      if (result.deletedCount >= remaining.length) {
        deleted += remaining.length;
        remaining = [];
        break;
      }

      // Partial success: some number succeeded, but the SDK doesn't
      // tell us *which* keys failed - only how many. Retrying the same
      // full list is the only option available; UploadThing's delete
      // is idempotent (deleting an already-deleted key is a no-op), so
      // this is safe to repeat.
      deleted += result.deletedCount;

      console.error(
        `UploadThing cleanup partial: ${result.deletedCount}/${remaining.length} deleted on attempt ${attempt}.` +
          (attempt === 1 ? " Retrying once…" : "")
      );

      if (attempt === 2) {
        console.error(
          "UploadThing cleanup still incomplete after retry - keys attempted:",
          remaining
        );
      }
    }

    return { requested: keys.length, deleted };
  } catch (error) {
    console.error(
      "UploadThing cleanup failed (non-blocking):",
      error
    );
    return { requested: keys.length, deleted: 0 };
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
