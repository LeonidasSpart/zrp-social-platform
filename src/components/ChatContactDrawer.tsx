"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  X, User, Phone, Video, MoreHorizontal, Image as ImageIcon,
  Ban, Loader2,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";

interface SharedMediaMessage {
  id: string;
  imageUrl?: string | null;
  content: string;
}

interface ChatContactDrawerProps {
  receiverUsername: string;
  receiverName: string;
  receiverAvatar?: string;
  receiverBadgeType?: string | null;
  messages: SharedMediaMessage[];
  onClose: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatContactDrawer({
  receiverUsername,
  receiverName,
  receiverAvatar,
  receiverBadgeType,
  messages,
  onClose,
  onVoiceCall,
  onVideoCall,
}: ChatContactDrawerProps) {
  const [showMore, setShowMore] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // ─── Shared media: actual images only - excludes voice messages (🎤)
  // and document attachments (📎), which use the same imageUrl field
  // but aren't photos, matching what "Shared media" means on X. ──────
  const sharedMedia = useMemo(
    () =>
      messages.filter(
        (m) =>
          !!m.imageUrl &&
          !m.content?.startsWith("🎤") &&
          !m.content?.startsWith("📎")
      ),
    [messages]
  );

  const handleBlock = async () => {
    if (!confirm(blocked ? `Unblock @${receiverUsername}?` : `Block @${receiverUsername}? They won't be able to message or follow you.`)) {
      return;
    }
    setBlocking(true);
    try {
      const res = await fetch(`/api/users/${receiverUsername}/block`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBlocked(data.blocked);
      }
    } catch (error) {
      console.error("Block error:", error);
    } finally {
      setBlocking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:w-[400px] sm:max-h-[85vh] bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end p-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Profile summary ────────────────────────────────────── */}
        <div className="flex flex-col items-center px-6 pb-4">
          <div className="w-20 h-20 rounded-full bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold text-2xl overflow-hidden flex-shrink-0">
            {receiverAvatar ? (
              <img src={receiverAvatar} alt={receiverName} className="w-full h-full object-cover" />
            ) : (
              receiverName?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <p className="mt-3 font-bold text-lg text-gray-900 dark:text-white flex items-center gap-1">
            {receiverName}
            <VerifiedBadge badgeType={receiverBadgeType} />
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{receiverUsername}</p>
        </div>

        {/* ─── Quick actions ──────────────────────────────────────── */}
        <div className="flex items-start justify-center gap-8 px-6 pb-6">
          <Link
            href={`/profile/${receiverUsername}`}
            className="flex flex-col items-center gap-1.5 text-gray-700 dark:text-gray-200"
          >
            <span className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <User className="w-5 h-5" />
            </span>
            <span className="text-xs">Profile</span>
          </Link>

          <button
            onClick={() => {
              onClose();
              onVoiceCall?.();
            }}
            disabled={!onVoiceCall}
            className="flex flex-col items-center gap-1.5 text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            <span className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </span>
            <span className="text-xs">Call</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onVideoCall?.();
            }}
            disabled={!onVideoCall}
            className="flex flex-col items-center gap-1.5 text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            <span className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Video className="w-5 h-5" />
            </span>
            <span className="text-xs">Video</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMore((v) => !v)}
              className="flex flex-col items-center gap-1.5 text-gray-700 dark:text-gray-200"
            >
              <span className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <MoreHorizontal className="w-5 h-5" />
              </span>
              <span className="text-xs">More</span>
            </button>

            {showMore && (
              <div className="absolute top-14 right-0 z-10 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={handleBlock}
                  disabled={blocking}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                >
                  {blocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  {blocked ? "Unblock" : "Block"} @{receiverUsername}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Shared media ───────────────────────────────────────── */}
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              Shared media
            </p>
            {sharedMedia.length > 0 && (
              <span className="text-xs text-gray-400">{sharedMedia.length}</span>
            )}
          </div>

          {sharedMedia.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
              No shared photos yet
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 pb-2">
              {sharedMedia.slice(0, 8).map((m) => (
                <a
                  key={m.id}
                  href={m.imageUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                >
                  <img src={m.imageUrl!} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
