import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Press Kit",
  description:
    "Media resources, brand assets, and key information about ZRP Social, the Swiss-hosted social media platform built on free speech, privacy, and social impact.",
  alternates: { canonical: "/press" },

  ...buildSocialMetadata({
    title: "Press Kit | ZRP Social",
    description: "Media resources, brand assets, and key information about ZRP Social.",
    path: "/press",
  }),
};

export default function PressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
