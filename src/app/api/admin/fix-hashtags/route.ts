import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  try {
    // ─── Find all posts that have at least one hashtag ──────────────
    const posts = await prisma.post.findMany({
      where: { hashtags: { isEmpty: false } },
      select: { id: true, hashtags: true },
    });

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const post of posts) {
      const lowercased = post.hashtags.map((h) => h.toLowerCase());
      const changed = lowercased.some((h, i) => h !== post.hashtags[i]);

      if (changed) {
        await prisma.post.update({
          where: { id: post.id },
          data: { hashtags: lowercased },
        });
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      totalPostsWithHashtags: posts.length,
      updated: updatedCount,
      alreadyLowercase: unchangedCount,
    });
  } catch (error) {
    console.error("Hashtag fix error:", error);
    return NextResponse.json({ error: "Failed to fix hashtags" }, { status: 500 });
  }
}
