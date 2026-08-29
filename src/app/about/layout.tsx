import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "ZRP Social is the first Swiss-European social media platform, built around free speech, privacy, and security. Learn about our mission and why we call Switzerland home.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About ZRP Social",
    description:
      "The first Swiss-European social media platform, built around free speech, privacy, and security.",
    url: "/about",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About ZRP Social",
    description:
      "The first Swiss-European social media platform, built around free speech, privacy, and security.",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
