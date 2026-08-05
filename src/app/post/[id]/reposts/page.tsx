"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Repeat } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";

interface User {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  isFollowing?: boolean;
}

export default function RepostsPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchReposts();
    }
  }, [status, params.id]);

  const fetchReposts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/posts/${params.id}/reposts`);
      if (!res.ok) throw new Error("Failed to fetch reposts");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reposts");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/post/${params.id}`} className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Repeat className="w-5 h-5 text-green-500" />
          Reposts
        </h1>
        <span className="text-sm text-gray-500 ml-auto">{users.length} reposts</span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No reposts yet.</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.username}`}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition"
            >
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                    {(user.name || user.username)[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {user.name || user.username}
                  </span>
                  <VerifiedBadge badgeType={user.badgeType} />
                </div>
                <div className="text-sm text-gray-500">@{user.username}</div>
              </div>
              {user.isFollowing && (
                <span className="ml-auto text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                  Following
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
