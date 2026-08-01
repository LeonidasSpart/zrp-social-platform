"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  isFollowing: boolean;
}

export default function FollowingPage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchFollowing();
    }
  }, [params.username, status]);

  const fetchFollowing = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}/following`);
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching following:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${params.username}/follow`, {
        method: "POST",
      });
      if (res.ok) {
        setUsers(users.map((u) =>
          u.id === userId ? { ...u, isFollowing: !u.isFollowing } : u
        ));
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="mb-4">
        <Link
          href={`/profile/${params.username}`}
          className="text-blue-600 hover:underline text-sm"
        >
          ← Back to profile
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Following</h1>
      </div>

      {users.length === 0 ? (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 text-center">
          <p className="text-gray-500">Not following anyone yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition flex items-center justify-between"
            >
              <Link href={`/profile/${user.username}`} className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
                  {user.name?.[0] || "?"}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-500">@{user.username}</p>
                  {user.bio && <p className="text-xs text-gray-400 truncate">{user.bio}</p>}
                </div>
              </Link>
              {session?.user?.id !== user.id && (
                <button
                  onClick={() => handleFollow(user.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    user.isFollowing
                      ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {user.isFollowing ? "Unfollow" : "Follow"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
