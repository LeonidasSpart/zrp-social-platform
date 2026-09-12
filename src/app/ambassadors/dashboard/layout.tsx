import type { Metadata } from "next";

// A signed-in ambassador's own personalized status view (application
// state, country, invitation link) - the same URL renders different
// content per viewer and has no unique content for an anonymous visitor
// or a search index to show, so this is noindexed rather than given the
// same treatment as the public /ambassadors and /ambassadors/apply pages.
export const metadata: Metadata = {
  title: "Ambassador Dashboard",
  robots: { index: false, follow: false },
};

export default function AmbassadorsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
