import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireMusicUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user;
}
