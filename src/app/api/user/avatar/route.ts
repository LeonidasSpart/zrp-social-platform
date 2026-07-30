import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

    // Call UploadThing's presigned-URL request endpoint directly to see the raw error
    const presignRes = await fetch("https://api.uploadthing.com/v6/uploadFiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Uploadthing-Api-Key": process.env.UPLOADTHING_SECRET!,
      },
      body: JSON.stringify({
        files: [{ name: file.name, size: file.size, type: file.type }],
      }),
    });

    const presignText = await presignRes.text();
    console.log("UploadThing raw response status:", presignRes.status);
    console.log("UploadThing raw response body:", presignText);

    if (!presignRes.ok) {
      return NextResponse.json(
        { error: "Upload failed", debug: presignText },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, debug: presignText });
  } catch (error: any) {
    console.error("Avatar upload error (thrown):", error?.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
