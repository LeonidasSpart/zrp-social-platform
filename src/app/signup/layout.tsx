import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create your ZRP Social account and join the first Swiss-European social media platform.",
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Sign Up | ZRP Social",
    description:
      "Create your ZRP Social account and join the first Swiss-European social media platform.",
    url: "/signup",
    type: "website",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
