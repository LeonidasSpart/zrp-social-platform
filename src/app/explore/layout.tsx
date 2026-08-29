import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore",
  robots: { index: false, follow: false },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
