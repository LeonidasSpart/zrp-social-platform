import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your ZRP Social account.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
  ...buildSocialMetadata({
    title: "Log In | ZRP Social",
    description: "Log in to your ZRP Social account.",
    path: "/login",
  }),
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
