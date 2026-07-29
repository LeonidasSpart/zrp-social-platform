"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Image } from "lucide-react";

interface PostComposerProps {
  onPostCreated: (post: any) => void;
}

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large. Max 5MB.");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setImageUrl(data.url);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Submit post
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          imageUrl: imageUrl || undefined,
        }),
      });

      // Check if response is OK
      if (!res.ok) {
        let errorMsg = "Failed to create post";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // If response is not JSON
          if (res.status === 500) {
            // Post might still be created – reload to check
            window.location.reload();
            return;
          }
        }
        setError(errorMsg);
        return;
      }

      // Parse response
      let post;
      try {
        post = await res.json();
      } catch {
        // If response is not JSON but status is OK, post was created
        window.location.reload();
        return;
      }

      // Success
      onPostCreated(post);
      setContent("");
      setImageUrl("");
      setError(null);
    } catch (error) {
      console.error("Error creating post:", error);
      // If there's a network error, try reloading to see if post was created
      // In case of timeout, the post might still be created
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      setError("Something went wrong. Check your feed to see if your post was published.");
    } finally {
      setLoading(false);
    }
  };

  // Get display name with fallback
  const displayName = session?.user?.name || session?.user?.username || "User";
  const initial = displayName?.[0]?.toUpperCase() || "?";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 min-h-[80px] bg-transparent"
              maxLength={280}
            />

            {error && (
              <div className="text-red-500 dark:text-red-400 text-sm mt-1">
                {error}
              </div>
            )}

            {/* Image preview */}
            {imageUrl && (
              <div className="relative mt-2 rounded-lg overflow-hidden">
                <img
                  src={imageUrl}
                  alt="Upload preview"
                  className="max-h-60 w-auto rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 text-xl leading-none w-7 h-7 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="flex items-center gap-2">
                {/* Image upload button */}
                <label className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <Image className="w-5 h-5" />
                  {uploading && <span className="text-xs ml-1 text-gray-400 dark:text-gray-500">Uploading...</span>}
                </label>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {content.length}/280
                </span>
              </div>
              <button
                type="submit"
                disabled={!content.trim() || loading}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
