import { NextResponse } from "next/server";
import { getCachedCryptoMarketData } from "@/lib/crypto-market-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/news/crypto/market
 *
 * Top-100 cryptocurrency market snapshot for the Crypto News section.
 * Public, matching /api/news's own access model.
 *
 * On a provider failure this returns `success: false` with a generic
 * message - never a fabricated snapshot. The real error is logged
 * server-side for diagnosis but not echoed to the client verbatim,
 * consistent with how /api/news's own catch-all handles a failure.
 */
export async function GET() {
  try {
    const result = await getCachedCryptoMarketData();

    if (!result.ok) {
      console.error("ZRP crypto market data unavailable:", result.error);
      return NextResponse.json(
        { success: false, error: "Market data is temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        fetchedAt: result.fetchedAt.toISOString(),
        rows: result.rows,
      },
      {
        status: 200,
        headers: {
          // Short client-side cache matching the server's own TTL - a
          // browser refresh within the window reuses the same snapshot
          // rather than forcing a redundant round trip.
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("ZRP crypto market data route error:", error);
    return NextResponse.json(
      { success: false, error: "Market data is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
