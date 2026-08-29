import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Investors",
  description:
    "ZRP Social is building a global social platform from Switzerland, focused on people, privacy, security, freedom of expression, and real communities.",
  alternates: { canonical: "/investors" },
  openGraph: {
    title: "Invest in ZRP Social",
    description:
      "ZRP Social is building a global social platform from Switzerland, focused on people, privacy, security, and freedom of expression.",
    url: "/investors",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Invest in ZRP Social",
    description:
      "ZRP Social is building a global social platform from Switzerland, focused on people, privacy, security, and freedom of expression.",
  },
};

export default function InvestorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
