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
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log("Avatar upload attempt:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

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
      console.error("UploadThing error (returned):", JSON.stringify(uploadResult.error, null, 2));
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: uploadResult.data.url },
    });

    return NextResponse.json({
      success: true,
      avatarUrl: user.avatarUrl,
    });
  } catch (error: any) {
    console.error("Avatar upload error (thrown):", error?.message);
    console.error("Error cause:", JSON.stringify(error?.cause, null, 2));
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
