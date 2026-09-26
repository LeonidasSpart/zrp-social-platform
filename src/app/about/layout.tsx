import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SITE_URL, buildSocialMetadata } from "@/lib/seo/metadata";
import { translations, SUPPORTED_LANGUAGES, type Language } from "@/lib/translations";

const SUPPORTED_LANG_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

// Same fallback LanguageContext.tsx's t() uses: requested language, then
// English, then the raw key. Mirrors investors/layout.tsx so the
// crawlable title/description match whatever language this visitor's
// zrp-lang cookie already resolved the rest of the page to.
function resolve(lang: Language, key: "about.title" | "about.subtitle"): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

export async function generateMetadata(): Promise<Metadata> {
  const cookieLang = (await cookies()).get("zrp-lang")?.value as Language | undefined;
  const lang: Language = cookieLang && SUPPORTED_LANG_CODES.includes(cookieLang) ? cookieLang : "en";

  const title = resolve(lang, "about.title");
  const description = resolve(lang, "about.subtitle");

  return {
    title,
    description,
    alternates: { canonical: "/about" },
    ...buildSocialMetadata({
      title,
      description,
      path: "/about",
    }),
  };
}

// References the site-wide Organization/WebSite entities already declared
// in src/app/layout.tsx (@id-linked, per the same JSON-LD @graph pattern)
// instead of redeclaring Organization fields here, so this page's
// structured data can never drift out of sync with the canonical one.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${SITE_URL}/about#aboutpage`,
  name: "About ZRP Social",
  description: translations.en["about.subtitle"],
  url: `${SITE_URL}/about`,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#organization` },
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      {children}
    </>
  );
}
