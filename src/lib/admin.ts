import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";
import { prisma } from "./db";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Check session first (if role is present)
  if (session.user.role === "ADMIN") {
    return { authorized: true, session };
  }
  if (session.user.isAdmin) {
    return { authorized: true, session };
  }

  // Fallback: check DB (in case session doesn't have role)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role === "ADMIN") {
    return { authorized: true, session };
  }

  return { authorized: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") {
    return { authorized: true, session };
  }
  if (session.user.isAdmin) {
    return { authorized: true, session };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role === "ADMIN" || user?.role === "MODERATOR") {
    return { authorized: true, session };
  }

  return { authorized: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}
