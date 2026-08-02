import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

const f = createUploadthing();

// ─── FileRouter for authenticated users ─────────────────────────────
export const ourFileRouter = {
  // ─── Post image/video upload ──────────────────────────────────────
  postMedia: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    video: { maxFileSize: "32MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Post media uploaded:", file.url);
      return { url: file.url };
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
      console.log("Avatar uploaded:", file.url);
      return { url: file.url };
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
      console.log("Banner uploaded:", file.url);
      return { url: file.url };
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
      console.log("Chat image uploaded:", file.url);
      return { url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
