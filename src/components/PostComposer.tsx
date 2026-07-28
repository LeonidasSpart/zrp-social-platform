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

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
        alert(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Submit post
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          imageUrl: imageUrl || undefined, // send only if exists
        }),
      });

      if (res.ok) {
        const post = await res.json();
        onPostCreated(post);
        setContent("");
        setImageUrl(""); // clear image after post
      }
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
            {session?.user?.name?.[0] || "?"}
          </div>
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              className="w-full resize-none border-0 focus:ring-0 p-0 text-gray-800 placeholder-gray-400 min-h-[80px]"
              maxLength={280}
            />

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
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 text-xl leading-none"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 border-t border-gray-100 pt-2">
              <div className="flex items-center gap-2">
                {/* Image upload button */}
                <label className="cursor-pointer text-gray-500 hover:text-blue-500 transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <Image className="w-5 h-5" />
                  {uploading && <span className="text-xs ml-1 text-gray-400">Uploading...</span>}
                </label>
                <span className="text-xs text-gray-400">{content.length}/280</span>
              </div>
              <button
                type="submit"
                disabled={!content.trim() || loading}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
