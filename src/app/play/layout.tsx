import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP PLAY",
  description:
    "ZRP PLAY - trivia, memory and logic challenges, 1v1 duels with friends, daily challenges, XP, levels and leaderboards, built into ZRP Social.",
  alternates: { canonical: "/play" },
  openGraph: {
    title: "ZRP PLAY | Games, Duels & Daily Challenges",
    description:
      "Play quick games, challenge friends to 1v1 duels, join daily global challenges, and climb the ZRP PLAY leaderboard.",
    url: "/play",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP PLAY | Games, Duels & Daily Challenges",
    description:
      "Play quick games, challenge friends to 1v1 duels, join daily global challenges, and climb the ZRP PLAY leaderboard.",
  },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
