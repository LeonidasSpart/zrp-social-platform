import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { getGiftCatalog } from "@/lib/live-gifts/gift-service";

/** Catalog for the gift panel - display name/description are resolved client-side from `key` via i18n. */
export async function GET() {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  const gifts = await getGiftCatalog();
  return NextResponse.json({ gifts });
}
