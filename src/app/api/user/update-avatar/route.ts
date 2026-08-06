import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UTApi } from "uploadthing/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // ─── Case 1: client already uploaded to UploadThing, just persist the URL ───
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const avatarUrl = body?.avatarUrl;

      if (!avatarUrl || typeof avatarUrl !== "string") {
        return NextResponse.json({ error: "Missing avatarUrl" }, { status: 400 });
      }

      // Only allow URLs from our own UploadThing app to prevent arbitrary URL injection
      if (!avatarUrl.includes("utfs.io") && !avatarUrl.includes("ufs.sh")) {
        return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: session.user.id },
        data: { avatarUrl },
      });

      return NextResponse.json({ success: true, avatarUrl: user.avatarUrl });
    }

    // ─── Case 2: legacy raw-file upload via FormData ───
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Max size is 5MB." },
        { status: 400 }
      );
    }

    const utapi = new UTApi();
    const uploadResult = await utapi.uploadFiles(file);

    if (uploadResult.error) {
      console.error("UploadThing error:", JSON.stringify(uploadResult.error, null, 2));
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: uploadResult.data.ufsUrl },
    });

    return NextResponse.json({
      success: true,
      avatarUrl: user.avatarUrl,
    });
  } catch (error: any) {
    console.error("Avatar upload error:", error?.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
