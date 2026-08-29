import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shorts",
  robots: { index: false, follow: false },
};

export default function ShortsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
