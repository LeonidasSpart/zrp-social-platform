import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UTApi } from "uploadthing/server";
import { checkVideoSize } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";

const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const validVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];

// Flat cap on images regardless of plan - there's no per-plan image
// size limit today, only a per-plan image *count* limit elsewhere.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Each upload consumes real storage/bandwidth cost even for posts
  // that never get published - cap how often one user can upload.
  const limit = await rateLimit(req, { limit: 20, window: 60, type: "upload" });
  if (!limit.success) return limit.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type – support images and videos
    const isImage = validImageTypes.includes(file.type);
    const isVideo = validVideoTypes.includes(file.type);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed." },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: the client-declared MIME type (file.type) is trivial
    // to spoof - a renamed/relabeled malicious file would otherwise
    // sail through the check above. Verify what the file's own bytes
    // actually are before trusting it as image/video content.
    const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(headerBuffer);

    // .quicktime/.x-msvideo containers (MOV/AVI) and some GIF/WebP
    // encodes aren't always reliably sniffed by file-type from just the
    // header window, so only hard-reject when detection succeeds AND
    // clearly disagrees with the declared category - avoids false
    // positives on legitimate files file-type can't fully identify.
    if (detected) {
      const detectedIsImage = detected.mime.startsWith("image/");
      const detectedIsVideo = detected.mime.startsWith("video/");
      if ((isImage && !detectedIsImage) || (isVideo && !detectedIsVideo)) {
        return NextResponse.json(
          { error: "The file's contents don't match its declared type." },
          { status: 400 }
        );
      }
    }

    // Validate file size: flat cap for images, plan-based cap for video
    // (previously a flat 50MB regardless of plan, silently letting free-
    // plan users exceed their documented 32MB limit).
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Max size is 5MB." },
        { status: 400 }
      );
    }

    if (isVideo) {
      const plan = (session.user as any).plan || "free";
      const sizeCheck = checkVideoSize(file.size / (1024 * 1024), plan);
      if (!sizeCheck.allowed) {
        return NextResponse.json({ error: sizeCheck.message }, { status: 400 });
      }
    }

    const utapi = new UTApi();
    const uploadResult = await utapi.uploadFiles(file);

    if (uploadResult.error) {
      console.error("UploadThing error:", uploadResult.error);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: uploadResult.data.ufsUrl,
      filename: file.name,
      type: file.type,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
