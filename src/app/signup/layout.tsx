import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create your ZRP Social account and join a Swiss-European social media platform.",
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
  ...buildSocialMetadata({
    title: "Sign Up | ZRP Social",
    description: "Create your ZRP Social account and join a Swiss-European social media platform.",
    path: "/signup",
  }),
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
