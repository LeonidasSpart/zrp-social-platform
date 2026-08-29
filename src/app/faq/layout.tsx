import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about creating a ZRP Social account, posting, messaging, privacy, plans, and more.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | ZRP Social",
    description:
      "Answers to common questions about creating a ZRP Social account, posting, messaging, privacy, plans, and more.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | ZRP Social",
    description:
      "Answers to common questions about creating a ZRP Social account, posting, messaging, privacy, plans, and more.",
  },
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
