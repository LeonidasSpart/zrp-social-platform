import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const post = await prisma.post.update({
      where: { id: params.id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return NextResponse.json({ views: post.views });
  } catch (error) {
    // Post may not exist or was deleted — fail silently, views aren't critical
    return NextResponse.json({ views: null }, { status: 200 });
  }
}
