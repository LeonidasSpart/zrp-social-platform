import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function isValidFormat(u: string) {
  return /^[a-zA-Z0-9_]+$/.test(u) && u.length >= 3 && u.length <= 20;
}

function randomSuffix() {
  return Math.floor(Math.random() * 900 + 100); // 100–999
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("username") || "";
  const username = raw.trim();

  if (!isValidFormat(username)) {
    return NextResponse.json({ available: false, invalid: true, suggestions: [] });
  }

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ available: true, suggestions: [] });
  }

  // ─── Generate candidate suggestions and check which are free ───
  const base = username.slice(0, 16); // leave room for a 3-digit suffix within the 20-char limit
  const candidates = new Set<string>();
  while (candidates.size < 8) {
    candidates.add(`${base}${randomSuffix()}`);
  }
  const candidateList = Array.from(candidates);

  const taken = await prisma.user.findMany({
    where: { username: { in: candidateList } },
    select: { username: true },
  });
  const takenSet = new Set(taken.map((t) => t.username.toLowerCase()));

  const suggestions = candidateList
    .filter((c) => !takenSet.has(c.toLowerCase()))
    .slice(0, 3);

  return NextResponse.json({ available: false, suggestions });
}
