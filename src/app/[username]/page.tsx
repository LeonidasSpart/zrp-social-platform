import type { Metadata } from "next";
import ProfilePage from "@/app/profile/[username]/page";
import { buildProfileMetadata } from "@/lib/seo/profileMetadata";

// Reads the DB at request time via generateMetadata - force dynamic
// rendering so `next build` never tries to run that query without a
// reachable database.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const cleanUsername = username.replace(/^@/, "");
  // This short URL (/username) mirrors /profile/username - canonicalize
  // to the latter, which is what every internal link on the site points
  // to, so search engines consolidate ranking signals on one URL instead
  // of splitting them across two identical pages.
  return buildProfileMetadata(cleanUsername, `/profile/${cleanUsername}`);
}

export default async function ShortProfileUrlPage(
  props: {
    params: Promise<{ username: string }>;
  }
) {
  const params = await props.params;
  const { username } = await params;

  const cleanUsername = username.replace(/^@/, "");

  return (
    <ProfilePage
      params={Promise.resolve({
        username: cleanUsername,
      })}
    />
  );
}
