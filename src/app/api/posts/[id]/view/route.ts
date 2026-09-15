import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  // ⚠️ SECURITY: view-count manipulation. This endpoint has no auth
  // requirement by design (anonymous viewers count too), so IP-based
  // rate limiting is the only backstop against a script hammering it to
  // inflate a post's view count - see src/lib/rate-limit.ts. Limit is
  // generous (well above any real scrolling session) since it now also
  // fires from the Shorts/video feed on every autoplay transition.
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "post-view" });
  if (!limit.success) return limit.response;

  try {
    const post = await prisma.post.update({
      where: { id: params.id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return NextResponse.json({ views: post.views });
  } catch (error) {
    // Post may not exist or was deleted: fail silently, views aren't critical
    return NextResponse.json({ views: null }, { status: 200 });
  }
}
