"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Upload, Loader2 } from "lucide-react";
import { uploadFiles } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";

interface ShortUploadModalProps {
  onClose: () => void;
  onUploaded: (post: any) => void;
}

// ─── Dedicated "post a Short" flow ───────────────────────────────────
// A Short is just a normal video post under the hood (mediaType: "video"),
// which is exactly what /api/videos already filters on - so anything
// uploaded here shows up in the Shorts feed alongside every other video
// post on the platform, with no schema changes needed.
export default function ShortUploadModal({ onClose, onUploaded }: ShortUploadModalProps) {
  const { data: session } = useSession();
  const plan = (session?.user?.plan as any) || "free";
  const limits = getPlanLimits(plan);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setError(null);
    if (!selected) return;

    if (!selected.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    const maxBytes = limits.videoUploadMB * 1024 * 1024;
    if (selected.size > maxBytes) {
      setError(`Video must be under ${limits.videoUploadMB}MB on your plan.`);
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Choose a video first.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFiles("postMedia", { files: [file] });
      if (!result || result.length === 0) {
        throw new Error("Upload failed - no file returned.");
      }
      const ufsUrl = result[0].ufsUrl;

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: caption.trim(),
          imageUrl: ufsUrl,
          mediaType: "video",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to publish Short.");
      }

      const data = await res.json();
      onUploaded(data.post || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zrp-charcoal rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Post a Short</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {previewUrl ? (
            <div className="relative aspect-[9/16] max-h-[50vh] mx-auto bg-black rounded-xl overflow-hidden">
              <video
                src={previewUrl}
                className="w-full h-full object-contain"
                controls
                playsInline
              />
              <button
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[9/16] max-h-[50vh] mx-auto flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-zrp-red hover:text-zrp-red transition"
            >
              <Upload className="w-8 h-8" />
              <span className="text-sm">Choose a video</span>
              <span className="text-xs text-gray-400">Up to {limits.videoUploadMB}MB</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption..."
            rows={2}
            maxLength={limits.postLength}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="w-full bg-zrp-red text-white py-2.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Posting...
              </>
            ) : (
              "Post Short"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
