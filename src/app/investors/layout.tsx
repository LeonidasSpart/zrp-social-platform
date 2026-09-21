import type { Metadata } from "next";

const TITLE = "Investor Relations";
const DESCRIPTION =
  "ZRP Social is a live social platform built from Switzerland, spanning Web, PWA, Android, and iOS. Learn what has been built, how ZRP generates revenue, and how to contact Investor Relations.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/investors" },
  openGraph: {
    title: `${TITLE} | ZRP Social`,
    description: DESCRIPTION,
    url: "/investors",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | ZRP Social`,
    description: DESCRIPTION,
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "ZRP Social Investor Relations",
  description: DESCRIPTION,
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
