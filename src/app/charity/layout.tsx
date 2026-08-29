import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Charity Commitment",
  description:
    "35% of ZRP Social's platform profits go to charities supporting orphans, schools, hospitals, and climate relief. Learn about our social impact commitment.",
  alternates: { canonical: "/charity" },
  openGraph: {
    title: "Charity Commitment | ZRP Social",
    description:
      "35% of ZRP Social's platform profits go to charities supporting orphans, schools, hospitals, and climate relief.",
    url: "/charity",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Charity Commitment | ZRP Social",
    description:
      "35% of ZRP Social's platform profits go to charities supporting orphans, schools, hospitals, and climate relief.",
  },
};

export default function CharityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
