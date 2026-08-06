import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";
import crypto from "crypto";

export async function validateApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 };
  }

  const plainKey = authHeader.slice(7); // remove "Bearer "
  const hash = crypto.createHash("sha256").update(plainKey).digest("hex");

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash: hash,
      revoked: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          plan: true,
          avatarUrl: true,
          // include other fields as needed
        },
      },
    },
  });

  if (!apiKey) {
    return { error: "Invalid or expired API key", status: 401 };
  }

  // Update lastUsed timestamp
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  return { user: apiKey.user, key: apiKey };
}
