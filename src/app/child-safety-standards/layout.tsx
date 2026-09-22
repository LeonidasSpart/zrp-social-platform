import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Child Safety Standards",
  description:
    "ZRP Social's published standards against child sexual abuse and exploitation (CSAE), our reporting mechanism, and how to contact us about child safety concerns.",
  alternates: { canonical: "/child-safety-standards" },

  ...buildSocialMetadata({
    title: "Child Safety Standards | ZRP Social",
    description: "ZRP Social's published standards against child sexual abuse and exploitation (CSAE).",
    path: "/child-safety-standards",
  }),
};

export default function ChildSafetyStandardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
