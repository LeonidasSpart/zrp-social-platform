import { Metadata } from "next";
import AmbassadorsExperience from "@/components/ambassadors/AmbassadorsExperience";

export const metadata: Metadata = {
  title: "Global Ambassadors",
  description:
    "Build your community. Represent your country. Connect the world. Join the ZRP Global Ambassadors program.",
  alternates: { canonical: "/ambassadors" },
  openGraph: {
    title: "ZRP Global Ambassadors",
    description: "Build your community. Represent your country. Connect the world.",
    url: "/ambassadors",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP Global Ambassadors",
    description: "Build your community. Represent your country. Connect the world.",
  },
};

export default function AmbassadorsPage() {
  return <AmbassadorsExperience />;
}
