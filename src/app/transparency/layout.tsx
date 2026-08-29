import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moderation Transparency",
  description:
    "Real, aggregate moderation statistics from ZRP Social - reports received, actions taken, and resolution times. No personal data, no post content, no usernames.",
  alternates: { canonical: "/transparency" },
  openGraph: {
    title: "Moderation Transparency | ZRP Social",
    description:
      "Real, aggregate moderation statistics from ZRP Social - reports received, actions taken, and resolution times.",
    url: "/transparency",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Moderation Transparency | ZRP Social",
    description:
      "Real, aggregate moderation statistics from ZRP Social - reports received, actions taken, and resolution times.",
  },
};

export default function TransparencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
