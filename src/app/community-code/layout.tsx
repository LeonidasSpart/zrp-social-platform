import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP Community & Leadership Code",
  description:
    "One framework, four levels of responsibility. The same Community Guidelines apply to everyone on ZRP - Ambassadors, Country Managers and ZRP staff carry additional standards on top of them.",
  alternates: { canonical: "/community-code" },
  openGraph: {
    title: "ZRP Community & Leadership Code",
    description:
      "One framework, four levels of responsibility for everyone who represents ZRP publicly.",
    url: "/community-code",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP Community & Leadership Code",
    description:
      "One framework, four levels of responsibility for everyone who represents ZRP publicly.",
  },
};

export default function CommunityCodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
