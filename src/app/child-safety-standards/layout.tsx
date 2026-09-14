import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Child Safety Standards",
  description:
    "ZRP Social's published standards against child sexual abuse and exploitation (CSAE), our reporting mechanism, and how to contact us about child safety concerns.",
  alternates: { canonical: "/child-safety-standards" },
  openGraph: {
    title: "Child Safety Standards | ZRP Social",
    description:
      "ZRP Social's published standards against child sexual abuse and exploitation (CSAE).",
    url: "/child-safety-standards",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Child Safety Standards | ZRP Social",
    description:
      "ZRP Social's published standards against child sexual abuse and exploitation (CSAE).",
  },
};

export default function ChildSafetyStandardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
