import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP LAUNCHPAD",
  description: "Create your own Solana SPL token on ZRP Launchpad.",
  alternates: { canonical: "/launchpad" },

  ...buildSocialMetadata({
    title: "ZRP LAUNCHPAD | Create a Solana Token",
    description: "Mint an SPL token on Solana in minutes - no code required.",
    path: "/launchpad",
  }),
};

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
