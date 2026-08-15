import ProfilePage from "@/app/profile/[username]/page";

// ─── Short, X-style profile URL: zrp.one/username or zrp.one/@username ───
// Reuses the existing /profile/[username] page component as-is (same data
// fetching, same UI) — this file just resolves the incoming slug (stripping
// a leading "@" if present) and hands it off. The underlying API route
// already resolves by username OR customUrl, so no extra lookup is needed
// here; a custom URL like "myname" or "@myname" both work automatically.
export default function ShortProfileUrlPage({ params }: { params: { username: string } }) {
  const cleanUsername = params.username.replace(/^@/, "");
  return <ProfilePage params={{ username: cleanUsername }} />;
}
