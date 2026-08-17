import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

const f = createUploadthing();

// ─── FileRouter for authenticated users ─────────────────────────────
export const ourFileRouter = {
  // ─── Post image/video upload ──────────────────────────────────────
  postMedia: f({
    // maxFileCount was 1 for images, but the composer's own UI lets
    // someone select up to 4 at once (Math.min(planLimit, 4), a
    // deliberate ceiling matching the 4-image grid layout, applying
    // even to Business/Enterprise plans with higher nominal limits) -
    // any attempt to upload more than 1 image was rejected by
    // UploadThing's own validation before it ever reached this app's
    // code, with exactly the "FileCountMismatch" error reported.
    image: { maxFileSize: "4MB", maxFileCount: 4 },
    video: { maxFileSize: "32MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Post media uploaded:", file.ufsUrl);
      return { url: file.ufsUrl };
    }),

  // ─── Avatar upload ──────────────────────────────────────────────
  avatar: f({
    image: { maxFileSize: "2MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Avatar uploaded:", file.ufsUrl);
      return { url: file.ufsUrl };
    }),

  // ─── Banner upload ──────────────────────────────────────────────
  banner: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Banner uploaded:", file.ufsUrl);
      return { url: file.ufsUrl };
    }),

  // ─── Chat image upload ──────────────────────────────────────────
  chatImage: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Chat image uploaded:", file.ufsUrl);
      return { url: file.ufsUrl };
    }),

  // ─── Chat document upload (PDF, Word, Excel, PowerPoint, plain text) ──
  chatFile: f({
    pdf: { maxFileSize: "8MB", maxFileCount: 1 },
    text: { maxFileSize: "8MB", maxFileCount: 1 },
    blob: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Chat document uploaded:", file.ufsUrl, file.name);
      return { url: file.ufsUrl, name: file.name };
    }),

  // ─── Chat voice message upload ───────────────────────────────────
  chatAudio: f({
    audio: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Chat voice message uploaded:", file.ufsUrl);
      return { url: file.ufsUrl };
    }),

  // ─── Story media upload (image or video) ────────────────────────
  storyMedia: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    video: { maxFileSize: "16MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Story media uploaded:", file.ufsUrl);
      // file.type is "image" or "video" – you can use that to store mediaType
      return { url: file.ufsUrl, type: file.type };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

// ─── Cleanup: delete the underlying UploadThing file when the post /
// message / comment / story that referenced it gets deleted ──────────
//
// Every route above only ever stored the file's public URL, never its
// UploadThing file key - deleting a post's database row never removed
// the actual file from UploadThing, so every image/video anyone ever
// deleted was still sitting in storage indefinitely (and still costing
// storage, still reachable by URL). UploadThing's URLs always end in
// `/f/{fileKey}` (both the legacy utfs.io domain and the current
// {appId}.ufs.sh domain), so the key can be recovered from the stored
// URL alone - no schema change or backfill needed to start cleaning
// these up going forward.
export function extractUploadThingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname; // e.g. "/f/abc123"
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

// Best-effort deletion - deliberately never throws. This is meant to be
// called right alongside a prisma delete of the record that owned the
// file; if UploadThing's API is briefly down or a URL doesn't parse,
// that should never block or fail the actual content deletion the user
// asked for. Worst case, a file is orphaned and this can be retried
// later - better than a delete button that sometimes doesn't work.
export async function deleteUploadThingFiles(
  urls: (string | null | undefined)[]
): Promise<void> {
  const keys = urls
    .map((u) => extractUploadThingKey(u))
    .filter((k): k is string => !!k);

  if (keys.length === 0) return;

  try {
    const { UTApi } = await import("uploadthing/server");
    const utapi = new UTApi();
    await utapi.deleteFiles(keys);
  } catch (error) {
    console.error("UploadThing cleanup failed (non-blocking):", error);
  }
}
