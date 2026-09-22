import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP OPPORTUNITY",
  description:
    "ZRP OPPORTUNITY connects creators, developers, students, employees, businesses and organizations with jobs, internships, scholarships, mentorship, freelance projects and more.",
  alternates: { canonical: "/opportunity" },

  ...buildSocialMetadata({
    title: "ZRP OPPORTUNITY | Jobs, Internships & Collaboration",
    description: "Find jobs, remote work, internships, scholarships, mentorship, freelance projects, sponsorships and hackathons on ZRP.",
    path: "/opportunity",
  }),
};

export default function OpportunityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
