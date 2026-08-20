import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

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

    video: {
      maxFileSize: "32MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
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

  if (keys.length === 0) {
    return;
  }

  try {
    const { UTApi } =
      await import(
        "uploadthing/server"
      );

    const utapi = new UTApi();

    await utapi.deleteFiles(
      keys
    );
  } catch (error) {
    console.error(
      "UploadThing cleanup failed (non-blocking):",
      error
    );
  }
}
