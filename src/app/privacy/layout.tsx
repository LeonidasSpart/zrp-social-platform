import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the ZRP Social Privacy Policy to learn how we collect, use, and protect your data under Swiss data protection law.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy | ZRP Social",
    description:
      "How ZRP Social collects, uses, and protects your data under Swiss data protection law.",
    url: "/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | ZRP Social",
    description:
      "How ZRP Social collects, uses, and protects your data under Swiss data protection law.",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
