import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the ZRP Social team for general support, press inquiries, or to report an issue.",
  alternates: { canonical: "/contact" },

  ...buildSocialMetadata({
    title: "Contact ZRP Social",
    description: "Get in touch with the ZRP Social team for general support, press inquiries, or to report an issue.",
    path: "/contact",
  }),
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
