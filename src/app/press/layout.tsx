import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Press Kit",
  description:
    "Media resources, brand assets, and key information about ZRP Social, the Swiss-hosted social media platform built on free speech, privacy, and social impact.",
  alternates: { canonical: "/press" },
  openGraph: {
    title: "Press Kit | ZRP Social",
    description:
      "Media resources, brand assets, and key information about ZRP Social.",
    url: "/press",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Press Kit | ZRP Social",
    description:
      "Media resources, brand assets, and key information about ZRP Social.",
  },
};

export default function PressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
