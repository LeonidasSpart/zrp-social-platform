import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { getGiftHistoryForCreator } from "@/lib/live-gifts/gift-service";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

/** Gifts received while live - activity, count, and USDC-equivalent value, for the creator dashboard. */
export async function GET() {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  const gifts = await getGiftHistoryForCreator(auth.userId);
  return jsonWithDecimals({ gifts });
}
