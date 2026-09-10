import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/translations";
import {
  LEGAL_CONFIGS,
  LEGAL_PAGE_IDS,
  resolvePage,
  resolveMoreHelpText,
  type LegalPageId,
} from "@/lib/legal-content";

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

function isLegalPageId(value: string): value is LegalPageId {
  return (LEGAL_PAGE_IDS as string[]).includes(value);
}

/**
 * Public, read-only content feed for the native app's Terms / Privacy /
 * Guidelines / Help Center / Contact screens (see
 * android-native/.../ui/legal). Every string in the response is read live
 * from `translations` in src/lib/translations.ts - the exact same object
 * the web pages at /terms, /privacy, /guidelines, /help and /contact
 * already render through useLanguage()/t(). Nothing here is a separate,
 * hand-maintained copy of the legal text.
 *
 * GET /api/legal/:page?lang=xx
 *   page: "terms" | "privacy" | "guidelines" | "help" | "contact" | "about" | "careers"
 *   lang: one of the 11 SUPPORTED_LANGUAGES codes (default "en"); an
 *         unrecognized code falls back to "en", matching the site's own
 *         detectBrowserLanguage()/cookie fallback in LanguageContext.tsx.
 *
 * Response shape:
 *   {
 *     page: string,
 *     lang: string,
 *     title: string,
 *     subtitle?: string,
 *     sections: [{
 *       id: string,
 *       number?: string,
 *       title: string,
 *       body: [
 *         { type: "heading", text },
 *         { type: "paragraph", text, style?: "callout" },
 *         { type: "bullets", items: string[] },
 *         { type: "cards", items: [{ title?, text?, meta? }] },
 *         { type: "table", headers: string[], rows: [{ label, values }] },
 *         { type: "faq", items: [{ question, answer }] },
 *       ]
 *     }]
 *   }
 */
export async function GET(req: NextRequest, props: { params: Promise<{ page: string }> }) {
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "legal-content-get" });
  if (!limit.success) return limit.response;

  const { page } = await props.params;

  if (!isLegalPageId(page)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestedLang = req.nextUrl.searchParams.get("lang") ?? "en";
  const lang: Language = (SUPPORTED_CODES as string[]).includes(requestedLang)
    ? (requestedLang as Language)
    : "en";

  const config = LEGAL_CONFIGS[page];
  const resolved = resolvePage(config, lang);

  // contact.moreHelpDesc carries {faq}/{help} template placeholders that
  // the web page (src/app/contact/page.tsx) substitutes with live links -
  // do the same substitution here, using the same two label keys, so the
  // "more-help" card reads as one real sentence instead of raw template
  // tokens.
  if (page === "contact") {
    const moreHelpSection = resolved.sections.find((s) => s.id === "more-help");
    if (moreHelpSection) {
      moreHelpSection.body = [{ type: "paragraph", text: resolveMoreHelpText(lang) }];
    }
  }

  return NextResponse.json({
    page,
    lang,
    ...resolved,
  });
}
