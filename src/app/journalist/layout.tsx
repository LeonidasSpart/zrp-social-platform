import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Journalist Dashboard",
  robots: { index: false, follow: false },
};

export default function JournalistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
