import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    "ZRP Social's Community Guidelines: the rules for user conduct, content, and moderation that keep the platform safe, drawn directly from our Terms of Service.",
  alternates: { canonical: "/guidelines" },
  openGraph: {
    title: "Community Guidelines | ZRP Social",
    description:
      "The rules for user conduct, content, and moderation that keep ZRP Social safe.",
    url: "/guidelines",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Community Guidelines | ZRP Social",
    description:
      "The rules for user conduct, content, and moderation that keep ZRP Social safe.",
  },
};

export default function GuidelinesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
