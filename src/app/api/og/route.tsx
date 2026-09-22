import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// Runs on Node (not Edge) so it can read the real logo asset from disk
// with `fs` rather than fetching its own origin - self-fetching a
// running server from inside one of its own request handlers is a
// well-known footgun (it can deadlock a single-instance dev server, and
// depends on the request's own host header resolving back to itself).
export const runtime = "nodejs";
// The image only depends on the query string, never on request-time
// state (no DB read, no auth) - safe to let Next cache/reuse the
// response across requests for the same title/subtitle.
export const revalidate = false;

// Every public route's default social-preview image. Every important
// section (Ambassadors, Investors, ...) passes its own title/subtitle
// so it gets a distinct, branded image without hand-producing a
// separate static asset per page - see src/lib/seo/metadata.ts, which
// is what actually builds this URL for a page's openGraph.images.
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_TITLE_LENGTH = 90;
const MAX_SUBTITLE_LENGTH = 140;

// Read once per server instance and reused for every image - the logo
// itself never changes at runtime, and re-reading the file on every
// request would be pure waste. Base64-inlined because ImageResponse
// (Satori) cannot resolve a relative `/logo.png` src the way a normal
// browser page can; it needs a real URL or a data URI up front.
let cachedLogoDataUrl: string | null | undefined;
function getLogoDataUrl(): string | null {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
    cachedLogoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

// Truncates at the last whole word inside the limit, with an ellipsis -
// a hard character cut (the original approach) produced words sliced
// mid-letter ("...how ZRP generat"), which reads as broken rather than
// intentionally shortened.
function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawTitle = searchParams.get("title")?.trim();
  const rawSubtitle = searchParams.get("subtitle")?.trim();

  const title = truncateAtWord(rawTitle || "ZRP Social", MAX_TITLE_LENGTH);
  const subtitle = rawSubtitle ? truncateAtWord(rawSubtitle, MAX_SUBTITLE_LENGTH) : null;
  const logoDataUrl = getLogoDataUrl();

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "linear-gradient(135deg, #050505 0%, #0D0D0D 55%, #1a0808 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand accent - the one red element on the page, matching the
            "red is the only primary action colour, spend it once" rule. */}
        <div
          style={{
            display: "flex",
            width: "96px",
            height: "8px",
            background: "#FF2D2D",
            borderRadius: "4px",
            marginBottom: "48px",
          }}
        />

        {logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- next/og's ImageResponse (Satori) needs a real <img>, not next/image.
          <img
            src={logoDataUrl}
            width={72}
            height={48}
            style={{ objectFit: "contain", marginBottom: "36px" }}
            alt=""
          />
        )}

        <div
          style={{
            display: "flex",
            fontSize: title.length > 40 ? 56 : 68,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "#FFFFFF",
            maxWidth: "1000px",
          }}
        >
          {title}
        </div>

        {subtitle && (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#BDBDBD",
              marginTop: "24px",
              maxWidth: "920px",
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </div>
        )}

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "60px",
            left: "80px",
            fontSize: 26,
            fontWeight: 700,
            color: "#FF2D2D",
          }}
        >
          ZRP Social
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // A day of shared/CDN caching keyed by the full query string
        // (title/subtitle) - social crawlers re-fetch a link's preview
        // relatively rarely, and this is pure function of its inputs.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    }
  );

  return image;
}
