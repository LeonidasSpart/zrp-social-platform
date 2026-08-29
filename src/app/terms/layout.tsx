import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the ZRP Social Terms of Service governing your use of the platform.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service | ZRP Social",
    description: "The Terms of Service governing your use of ZRP Social.",
    url: "/terms",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service | ZRP Social",
    description: "The Terms of Service governing your use of ZRP Social.",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
