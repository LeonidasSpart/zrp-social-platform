import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Help build the first Swiss-European social media platform. Explore open roles at ZRP Social and join a team focused on free speech, privacy, and security.",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers at ZRP Social",
    description:
      "Help build the first Swiss-European social media platform. Explore open roles at ZRP Social.",
    url: "/careers",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Careers at ZRP Social",
    description:
      "Help build the first Swiss-European social media platform. Explore open roles at ZRP Social.",
  },
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
