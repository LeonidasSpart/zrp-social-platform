import ProfilePage from "@/app/profile/[username]/page";

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
