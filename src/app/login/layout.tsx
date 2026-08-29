import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your ZRP Social account.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Log In | ZRP Social",
    description: "Log in to your ZRP Social account.",
    url: "/login",
    type: "website",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
