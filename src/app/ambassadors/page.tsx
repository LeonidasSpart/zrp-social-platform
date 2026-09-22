import { Metadata } from "next";
import AmbassadorsExperience from "@/components/ambassadors/AmbassadorsExperience";
import { buildSocialMetadata } from "@/lib/seo/metadata";

const TITLE = "Global Ambassadors";
const DESCRIPTION =
  "Build your community. Represent your country. Connect the world. Join the ZRP Global Ambassadors program.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/ambassadors" },
  ...buildSocialMetadata({
    title: "ZRP Global Ambassadors",
    description: "Build your community. Represent your country. Connect the world.",
    path: "/ambassadors",
  }),
};

export default function AmbassadorsPage() {
  return <AmbassadorsExperience />;
}
