import ProfilePage from "@/app/profile/[username]/page";

export default async function ShortProfileUrlPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const cleanUsername = username.replace(/^@/, "");

  return (
    <ProfilePage
      params={{
        username: cleanUsername,
      }}
    />
  );
}
