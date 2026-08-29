import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ad Campaigns",
  robots: { index: false, follow: false },
};

export default function AdsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
