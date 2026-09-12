import type { Metadata } from "next";

// Nested routes don't inherit a parent page.tsx's metadata (only a
// parent layout.tsx cascades) - without this, /ambassadors/apply fell
// all the way back to the root layout's generic site-wide title, even
// though it's a real, public, always-linked landing page in its own
// right (Header.tsx/Sidebar.tsx link straight to it).
export const metadata: Metadata = {
  title: "Become a ZRP Ambassador",
  description:
    "Tell us about your country and your community. Apply to become a ZRP Global Ambassador - every application is reviewed by our team.",
  alternates: { canonical: "/ambassadors/apply" },
  openGraph: {
    title: "Become a ZRP Ambassador",
    description:
      "Apply to become a ZRP Global Ambassador and represent your country and community.",
    url: "/ambassadors/apply",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Become a ZRP Ambassador",
    description:
      "Apply to become a ZRP Global Ambassador and represent your country and community.",
  },
};

export default function AmbassadorsApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
