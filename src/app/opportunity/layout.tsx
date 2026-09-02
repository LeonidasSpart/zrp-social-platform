import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP OPPORTUNITY",
  description:
    "ZRP OPPORTUNITY connects creators, developers, students, employees, businesses and organizations with jobs, internships, scholarships, mentorship, freelance projects and more.",
  alternates: { canonical: "/opportunity" },
  openGraph: {
    title: "ZRP OPPORTUNITY | Jobs, Internships & Collaboration",
    description:
      "Find jobs, remote work, internships, scholarships, mentorship, freelance projects, sponsorships and hackathons on ZRP.",
    url: "/opportunity",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP OPPORTUNITY | Jobs, Internships & Collaboration",
    description:
      "Find jobs, remote work, internships, scholarships, mentorship, freelance projects, sponsorships and hackathons on ZRP.",
  },
};

export default function OpportunityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
