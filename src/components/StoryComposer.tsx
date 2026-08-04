"use client";

import { useState, useRef } from "react";
import { X, Image, Video, Send } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function StoryComposer({ onClose, onSuccess }: Props) {
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("storyMedia", {
    onClientUploadComplete: () => {
      // Upload handled separately below
    },
    onUploadError: (error) => {
      console.error("Upload error:", error);
      setUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size
    if (file.size > 16 * 1024 * 1024) {
      alert("File too large. Max 16MB.");
      return;
    }

    // Validate type
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("Only images and videos are supported.");
      return;
    }

    setMediaFile(file);
    setMediaType(isImage ? "image" : "video");
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!content && !mediaFile) {
      alert("Please add some content or a media file.");
      return;
    }

    setUploading(true);

    try {
      let mediaUrl = null;
      let finalMediaType = null;

      // Upload media if present
      if (mediaFile) {
        const uploadResult = await startUpload([mediaFile]);
        if (uploadResult && uploadResult.length > 0) {
          mediaUrl = uploadResult[0].url;
          finalMediaType = mediaType;
        } else {
          throw new Error("Upload failed");
        }
      }

      // Create story
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content || null,
          mediaUrl,
          mediaType: finalMediaType,
        }),
      });

      if (!res.ok) throw new Error("Failed to create story");

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error creating story:", error);
      alert("Failed to create story. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Add Story
        </h2>

        <div className="space-y-4">
          {/* Text input */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-zrp-red focus:border-transparent"
            rows={3}
            maxLength={200}
          />

          {/* Media preview */}
          {mediaPreview && (
            <div className="relative rounded-lg overflow-hidden">
              {mediaType === "image" ? (
                <img
                  src={mediaPreview}
                  alt="Story media"
                  className="w-full max-h-64 object-contain"
                />
              ) : (
                <video
                  src={mediaPreview}
                  className="w-full max-h-64 object-contain"
                  controls
                />
              )}
              <button
                onClick={() => {
                  setMediaFile(null);
                  setMediaPreview(null);
                  setMediaType(null);
                }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Media upload buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Image className="w-4 h-4" />
              Image
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = "video/*";
                  fileInputRef.current.click();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Video className="w-4 h-4" />
              Video
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Share Story
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Stories disappear after 24 hours. Max file size: 16MB.
          </p>
        </div>
      </div>
    </div>
  );
}
