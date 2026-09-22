import type { Metadata } from "next";
import { cookies } from "next/headers";
import { translations, SUPPORTED_LANGUAGES, type Language } from "@/lib/translations";

const SUPPORTED_LANG_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

// Same fallback LanguageContext.tsx's t() uses: requested language, then
// English, then the raw key.
function resolve(lang: Language, key: "investors.meta.title" | "investors.meta.description"): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

export async function generateMetadata(): Promise<Metadata> {
  // Mirrors the same zrp-lang cookie read RootLayout already does for
  // <html lang>/dir, so the crawlable title/description match whatever
  // language this visitor's cookie already resolved the rest of the page
  // to, instead of always shipping English metadata regardless of the
  // page's own rendered language.
  const cookieLang = (await cookies()).get("zrp-lang")?.value as Language | undefined;
  const lang: Language =
    cookieLang && SUPPORTED_LANG_CODES.includes(cookieLang) ? cookieLang : "en";

  const title = resolve(lang, "investors.meta.title");
  const description = resolve(lang, "investors.meta.description");

  return {
    title,
    description,
    alternates: { canonical: "/investors" },
    openGraph: {
      title: `${title} | ZRP Social`,
      description,
      url: "/investors",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ZRP Social`,
      description,
    },
  };
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "ZRP Social Investor Relations",
  description: translations.en["investors.meta.description"],
  url: "https://zrp.one/investors",
  publisher: {
    "@type": "Organization",
    name: "ZRP Social",
    email: "investors@zrp.one",
    url: "https://zrp.one",
  },
};

export default function InvestorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {children}
    </>
  );
}
