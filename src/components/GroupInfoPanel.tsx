"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X, Users, Pencil, Check, Loader2, Camera, UserMinus, LogOut, Ban, Crown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useUploadThing } from "@/lib/uploadthing-client";
import VerifiedBadge from "@/components/VerifiedBadge";
import UserMultiSelect, { type SelectableUser } from "@/components/UserMultiSelect";
import type { GroupConversationDetail } from "@/lib/groupConversationTypes";

interface GroupInfoPanelProps {
  conversation: GroupConversationDetail;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (conversation: GroupConversationDetail) => void;
  onLeft: () => void;
}

/**
 * Participant management surface: view members (name, avatar, real
 * presence dot, OWNER/MEMBER badge), any member can add more real
 * participants, only the OWNER can remove someone else, any member can
 * leave, and rename/avatar are OWNER-only IN THIS UI - but the actual
 * security boundary is the API's own role check (PATCH .../route.ts,
 * DELETE .../participants/[userId]/route.ts), never this panel hiding a
 * button. A non-owner who somehow reaches these actions still gets the
 * real 403 back from the server.
 */
export default function GroupInfoPanel({
  conversation,
  currentUserId,
  onClose,
  onUpdated,
  onLeft,
}: GroupInfoPanelProps) {
  const { t } = useLanguage();
  const { isOnline, hasStatus, requestStatus } = usePresence();

  const myMembership = conversation.participants.find((p) => p.userId === currentUserId);
  const isOwner = myMembership?.role === "OWNER";

  useEffect(() => {
    conversation.participants.forEach((p) => requestStatus(p.userId));
    // Only needs to run when the participant roster itself changes -
    // requestStatus is idempotent per userId (see PresenceContext's own
    // KDoc), so re-running on every unrelated re-render would be wasted
    // work, not a correctness issue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.participants.map((p) => p.userId).join(",")]);

  // ─── Rename ─────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name || "");
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === conversation.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRenameError(data?.error || t("group.info.errRename"));
        return;
      }
      onUpdated(data);
      setEditingName(false);
    } catch {
      setRenameError(t("group.info.errRename"));
    } finally {
      setSavingName(false);
    }
  };

  // ─── Avatar ─────────────────────────────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const { startUpload } = useUploadThing("chatImage", {
    onClientUploadComplete: async (files) => {
      if (!files?.length) {
        setUploadingAvatar(false);
        return;
      }
      try {
        const res = await fetch(`/api/conversations/${conversation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarUrl: files[0].ufsUrl }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setAvatarError(data?.error || t("group.info.errRename"));
        } else {
          onUpdated(data);
        }
      } catch {
        setAvatarError(t("group.info.errRename"));
      } finally {
        setUploadingAvatar(false);
      }
    },
    onUploadError: () => {
      setUploadingAvatar(false);
      setAvatarError(t("group.info.errRename"));
    },
  });

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      await startUpload([file]);
    } catch {
      setUploadingAvatar(false);
      setAvatarError(t("group.info.errRename"));
    }
  };

  // ─── Add members ────────────────────────────────────────────────────
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [newMembers, setNewMembers] = useState<SelectableUser[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const existingIds = useMemo(() => conversation.participants.map((p) => p.userId), [conversation.participants]);

  const submitAddMembers = async () => {
    if (newMembers.length === 0) return;
    setAddingMembers(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: newMembers.map((m) => m.id) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAddError(data?.error || t("group.info.errAdd"));
        return;
      }
      onUpdated(data);
      setNewMembers([]);
      setShowAddMembers(false);
    } catch {
      setAddError(t("group.info.errAdd"));
    } finally {
      setAddingMembers(false);
    }
  };

  // ─── Remove / leave ─────────────────────────────────────────────────
  const [actingOnUserId, setActingOnUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const removeParticipant = async (userId: string, displayName: string) => {
    if (!confirm(t("group.info.removeConfirm", { name: displayName }))) return;
    setActingOnUserId(userId);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/participants/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || t("group.info.errRemove"));
        return;
      }
      onUpdated({
        ...conversation,
        participants: conversation.participants.filter((p) => p.userId !== userId),
      });
    } catch {
      setActionError(t("group.info.errRemove"));
    } finally {
      setActingOnUserId(null);
    }
  };

  const leaveGroup = async () => {
    if (!confirm(t("group.info.leaveConfirm"))) return;
    setActingOnUserId(currentUserId);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/participants/${currentUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || t("group.info.errLeave"));
        return;
      }
      onLeft();
    } catch {
      setActionError(t("group.info.errLeave"));
    } finally {
      setActingOnUserId(null);
    }
  };

  // ─── Block ──────────────────────────────────────────────────────────
  const [blockingUsername, setBlockingUsername] = useState<string | null>(null);

  const toggleBlock = async (username: string) => {
    if (!confirm(`Block @${username}? They won't be able to message or follow you.`)) return;
    setBlockingUsername(username);
    try {
      await fetch(`/api/users/${username}/block`, { method: "POST" });
    } catch {
      // best-effort - a failed block leaves the member visible, which is
      // a safe failure mode (no false sense of being blocked)
    } finally {
      setBlockingUsername(null);
    }
  };

  const sortedParticipants = useMemo(
    () =>
      [...conversation.participants].sort((a, b) => {
        if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
        if (a.userId === currentUserId) return -1;
        if (b.userId === currentUserId) return 1;
        return (a.user.name || a.user.username).localeCompare(b.user.name || b.user.username);
      }),
    [conversation.participants, currentUserId]
  );

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-info-title"
    >
      <div
        className="w-full sm:w-[420px] sm:max-h-[85vh] bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 id="group-info-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {t("group.thread.info")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={t("action.cancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Group identity ────────────────────────────────────── */}
        <div className="flex flex-col items-center px-6 pb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-zrp-red/10 flex items-center justify-center text-zrp-red overflow-hidden flex-shrink-0">
              {conversation.avatarUrl ? (
                <img src={conversation.avatarUrl} alt={conversation.name || ""} className="w-full h-full object-cover" />
              ) : (
                <Users className="w-8 h-8" />
              )}
            </div>
            {isOwner && (
              <label
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-zrp-red text-white flex items-center justify-center cursor-pointer hover:bg-zrp-darkRed transition"
                title={t("group.info.changePhoto")}
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarPick}
                  disabled={uploadingAvatar}
                  className="hidden"
                  aria-label={t("group.info.changePhoto")}
                />
              </label>
            )}
          </div>

          {editingName ? (
            <div className="mt-3 w-full flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={100}
                autoFocus
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:border-zrp-red focus:ring-2 focus:ring-zrp-red/20"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={savingName || !nameDraft.trim()}
                className="p-2 rounded-full bg-zrp-red text-white disabled:opacity-50"
                aria-label={t("action.save")}
              >
                {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => isOwner && setEditingName(true)}
              disabled={!isOwner}
              className="mt-3 font-bold text-lg text-gray-900 dark:text-white flex items-center gap-1.5 disabled:cursor-default"
            >
              {conversation.name}
              {isOwner && <Pencil className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          )}
          {(renameError || avatarError) && (
            <p role="alert" aria-live="polite" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {renameError || avatarError}
            </p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t("group.memberCount", { count: conversation.participants.length })}
          </p>
        </div>

        {/* ─── Members ────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm text-gray-900 dark:text-white">{t("group.info.members")}</p>
            <button
              type="button"
              onClick={() => setShowAddMembers((v) => !v)}
              className="text-xs font-medium text-zrp-red hover:underline"
            >
              {t("group.info.addMembers")}
            </button>
          </div>

          {showAddMembers && (
            <div className="mb-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
              {addError && (
                <p role="alert" aria-live="polite" className="mb-2 text-xs text-red-600 dark:text-red-400">
                  {addError}
                </p>
              )}
              <UserMultiSelect
                selected={newMembers}
                onChange={setNewMembers}
                excludeIds={existingIds}
                disabled={addingMembers}
                ariaLabel={t("group.info.addMembers")}
              />
              <button
                type="button"
                onClick={submitAddMembers}
                disabled={newMembers.length === 0 || addingMembers}
                className="mt-2 w-full py-2 rounded-lg bg-zrp-red text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {addingMembers && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("group.info.addMembers")}
              </button>
            </div>
          )}

          {actionError && (
            <p role="alert" aria-live="polite" className="mb-2 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </p>
          )}

          <ul className="divide-y divide-gray-100 dark:divide-gray-800" aria-label={t("group.info.members")}>
            {sortedParticipants.map((p) => {
              const isSelf = p.userId === currentUserId;
              const displayName = p.user.name || p.user.username;
              const online = hasStatus(p.userId) && isOnline(p.userId);
              const acting = actingOnUserId === p.userId;

              return (
                <li key={p.userId} className="flex items-center gap-2.5 py-2.5">
                  <Link href={`/profile/${p.user.username}`} className="relative w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                    {p.user.avatarUrl ? (
                      <img src={p.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      displayName[0]?.toUpperCase()
                    )}
                    {hasStatus(p.userId) && (
                      <span
                        className={`absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zrp-deepBlack ${
                          online ? "bg-green-500" : "bg-gray-400"
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link href={`/profile/${p.user.username}`} className="flex items-center gap-1 min-w-0">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {displayName}
                      </span>
                      <VerifiedBadge badgeType={p.user.badgeType} className="flex-shrink-0" />
                      {isSelf && <span className="text-xs text-gray-400 flex-shrink-0">{t("group.info.you")}</span>}
                    </Link>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      {p.role === "OWNER" && <Crown className="w-3 h-3 text-amber-500" aria-hidden="true" />}
                      {p.role === "OWNER" ? t("group.info.owner") : t("group.info.member")}
                    </span>
                  </div>

                  {!isSelf && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleBlock(p.user.username)}
                        disabled={blockingUsername === p.user.username}
                        className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800 disabled:opacity-50"
                        title={t("chat.block")}
                        aria-label={`${t("chat.block")} ${displayName}`}
                      >
                        {blockingUsername === p.user.username ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Ban className="w-4 h-4" />
                        )}
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => removeParticipant(p.userId, displayName)}
                          disabled={acting}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800 disabled:opacity-50"
                          title={t("group.info.remove")}
                          aria-label={`${t("group.info.remove")} ${displayName}`}
                        >
                          {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ─── Leave ──────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
          <button
            type="button"
            onClick={leaveGroup}
            disabled={actingOnUserId === currentUserId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition"
          >
            {actingOnUserId === currentUserId ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            {t("group.info.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
