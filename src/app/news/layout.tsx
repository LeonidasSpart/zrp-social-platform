import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP News",
  description:
    "ZRP News brings you the latest stories from Switzerland, Europe and around the world.",
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
