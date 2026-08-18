import ProfilePage from "@/app/profile/[username]/page";

// ─── Short, X-style profile URL: zrp.one/username or zrp.one/@username ───
// Reuses the existing /profile/[username] page component.
// The incoming username is cleaned before being passed to the profile page.

export default async function ShortProfileUrlPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const cleanUsername = username.replace(/^@/, "");

  return (
    <ProfilePage
      params={Promise.resolve({ username: cleanUsername })}
    />
  );
}
