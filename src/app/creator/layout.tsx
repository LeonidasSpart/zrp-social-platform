import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator Dashboard",
  robots: { index: false, follow: false },
};

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
