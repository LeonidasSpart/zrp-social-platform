import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

/** Catalog for the Buy Coins modal - display name/description are resolved client-side from `key` via i18n, same pattern as /api/live/gifts. */
export async function GET() {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  const packages = await prisma.coinPackage.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ packages });
}
