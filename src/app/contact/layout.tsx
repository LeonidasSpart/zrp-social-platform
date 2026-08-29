import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the ZRP Social team for general support, press inquiries, or to report an issue.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact ZRP Social",
    description:
      "Get in touch with the ZRP Social team for general support, press inquiries, or to report an issue.",
    url: "/contact",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact ZRP Social",
    description:
      "Get in touch with the ZRP Social team for general support, press inquiries, or to report an issue.",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
