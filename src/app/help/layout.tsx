import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Learn how ZRP Social works, manage your account, understand our plans, protect your privacy, and get the most from the platform.",
  alternates: { canonical: "/help" },
  openGraph: {
    title: "Help Center | ZRP Social",
    description:
      "Learn how ZRP Social works, manage your account, understand our plans, and protect your privacy.",
    url: "/help",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Help Center | ZRP Social",
    description:
      "Learn how ZRP Social works, manage your account, understand our plans, and protect your privacy.",
  },
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
