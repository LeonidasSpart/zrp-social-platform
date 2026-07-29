"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  _count: {
    posts: number;
    comments: number;
  };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}`);
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const handleDelete = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const toggleAdmin = async (userId: string, currentAdmin: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !currentAdmin }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Users</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">User</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Posts</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Admin</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <Link href={`/profile/${user.username}`} className="hover:underline">
                      <span className="font-medium text-gray-900 dark:text-white">{user.name || user.username}</span>
                      <span className="text-gray-500 text-xs ml-1">@{user.username}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user._count.posts}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAdmin(user.id, user.isAdmin)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.isAdmin
                          ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {user.isAdmin ? "Admin" : "User"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
