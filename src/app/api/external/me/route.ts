import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ user: auth.user });
}
