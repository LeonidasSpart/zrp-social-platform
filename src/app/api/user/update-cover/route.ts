import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UTApi } from "uploadthing/server";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    // ─── Case 1: client already uploaded to UploadThing, just persist the URL ───
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const coverUrl = body?.coverUrl;

      if (!coverUrl || typeof coverUrl !== "string") {
        return NextResponse.json({ error: "Missing coverUrl" }, { status: 400 });
      }

      if (!coverUrl.includes("utfs.io") && !coverUrl.includes("ufs.sh")) {
        return NextResponse.json({ error: "Invalid cover URL" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: session.user.id },
        data: { coverUrl },
      });

      return NextResponse.json({ coverUrl: user.coverUrl });
    }

    // ─── Case 2: legacy raw-file upload via FormData ───
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only images are allowed." }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const utapi = new UTApi();
    const uploadResult = await utapi.uploadFiles(file);

    if (uploadResult.error) {
      console.error("UploadThing error:", JSON.stringify(uploadResult.error, null, 2));
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { coverUrl: uploadResult.data.ufsUrl },
    });

    return NextResponse.json({ coverUrl: user.coverUrl });
  } catch (error) {
    console.error("Cover upload error:", error);
    return NextResponse.json({ error: "Failed to upload cover" }, { status: 500 });
  }
}
