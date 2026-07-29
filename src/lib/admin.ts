import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { authorized: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.user.isAdmin) {
    return { authorized: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { authorized: true, session };
}
