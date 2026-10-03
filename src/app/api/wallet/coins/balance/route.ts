import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { getCoinBalance } from "@/lib/live-gifts/gift-service";

export async function GET() {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  const balance = await getCoinBalance(auth.userId);
  return NextResponse.json({ balance });
}
