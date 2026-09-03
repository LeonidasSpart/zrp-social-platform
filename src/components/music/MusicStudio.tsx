"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  UploadCloud, Lock, X, Pencil, Trash2, Disc3, Music2, User as UserIcon,
  Plus, ChevronUp, ChevronDown, ImagePlus, Check, AlertTriangle,
} from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTotalDuration } from "@/lib/music/duration";
import { MUSIC_GENRES } from "@/lib/music/genres";

type MusicAccess = {
  allowed: boolean;
  isCreator: boolean;
  isVerifiedArtist: boolean;
  hasArtistProfile: boolean;
  reason?: string;
};

type StudioArtist = {
  id: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  verified: boolean;
};

type StudioAlbum = {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  coverKey?: string | null;
  releaseDate?: string | null;
  totalDurationSec?: number;
  _count?: { tracks: number };
};

type StudioTrack = {
  id: string;
  title: string;
  description?: string | null;
  genre?: string | null;
  explicit: boolean;
  status: string;
  audioUrl: string;
  coverUrl?: string | null;
  coverKey?: string | null;
  albumId?: string | null;
  trackNumber?: number | null;
  playCount: number;
  createdAt: string;
  album?: { id: string; title: string } | null;
};

type PendingUpload = {
  audioUrl: string;
  audioKey?: string | null;
  coverUrl?: string | null;
  coverKey?: string | null;
  durationSec?: number | null;
};

// Reads a track's length straight from the file the browser already
// has, before it's even uploaded - MusicTrack.durationSec was never
// being set at all (the create-track request never sent it), which is
// why every track list showed "--:--" regardless of platform. Resolves
// null rather than rejecting on a file the browser can't probe (some
// mobile browsers/codecs), so a duration failure never blocks
// publishing.
function probeAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      const duration = audio.duration;
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null);
    };
    const onError = () => {
      cleanup();
      resolve(null);
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    audio.preload = "metadata";
    audio.src = objectUrl;
  });
}

// A file picked through a cloud storage app's own picker (Google
// Drive, MEGA, Dropbox, OneDrive - not just iCloud) can hand back a
// content:// reference the OS has to stream/decrypt on demand rather
// than actual local bytes. When that stream stalls - the file hasn't
// finished downloading, or the app needs to decrypt it first - the
// upload can hang with zero feedback: Publish just does nothing
// forever, which is indistinguishable from the feature being broken.
// Reading a small slice up front, with a timeout, catches this before
// committing to the full (possibly multi-minute) upload and turns a
// silent hang into a clear, actionable error.
//
// MEGA specifically encrypts everything client-side, so its Android/
// iOS app generally can't hand over a slice of a file until it has
// downloaded and decrypted the WHOLE thing locally first - there's no
// partial read to serve. The original 8s timeout here was tuned for
// "provider is stalled/broken", not "provider needs to pull down and
// decrypt a multi-MB file over mobile data first", so real MEGA
// uploads were being killed with a false "unreadable" error before
// MEGA had even finished preparing the file. 60s gives that a real
// chance to complete while still catching a genuinely dead handle.
function verifyFileReadable(file: File, timeoutMs = 60000): Promise<boolean> {
  const slice = file.slice(0, Math.min(file.size, 65536));
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const read = slice
    .arrayBuffer()
    .then(() => true)
    .catch(() => false);
  return Promise.race([read, timeout]);
}

type Tab = "tracks" | "albums" | "artist";
export type StudioTab = Tab;

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[10050] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div
        className={`w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} sm:mx-4 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto rounded-t-[28px] sm:rounded-[24px] bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/10 p-5 sm:p-7`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MusicStudio({
  onClose,
  onTrackChange,
  initialTab,
}: {
  onClose: () => void;
  onTrackChange?: () => void;
  initialTab?: StudioTab;
}) {
  const { t } = useLanguage();
  const { data: session } = useSession();

  const [access, setAccess] = useState<MusicAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [applyName, setApplyName] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [tab, setTab] = useState<Tab>(
    initialTab === "tracks" || initialTab === "albums" || initialTab === "artist" ? initialTab : "tracks"
  );

  // A single, shared success/error banner for every Studio action -
  // create/edit/delete on tracks and albums all report through this
  // instead of silently updating a list, so an artist always gets
  // explicit confirmation of what just happened.
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [message]);

  const loadAccess = useCallback(async () => {
    setAccessLoading(true);
    try {
      const res = await fetch("/api/music/access", { cache: "no-store" });
      if (res.ok) setAccess(await res.json());
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) loadAccess();
    else {
      setAccess(null);
      setAccessLoading(false);
    }
  }, [session?.user, loadAccess]);

  // ── Tracks ────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<StudioTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [editingTrack, setEditingTrack] = useState<StudioTrack | null>(null);
  const [deletingTrack, setDeletingTrack] = useState<StudioTrack | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadMyTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const res = await fetch("/api/music/tracks?mine=true&limit=100", { cache: "no-store" });
      if (res.ok) setTracks(await res.json());
    } finally {
      setTracksLoading(false);
    }
  }, []);

  // ── Albums ────────────────────────────────────────────────────────
  const [albums, setAlbums] = useState<StudioAlbum[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [managingAlbum, setManagingAlbum] = useState<StudioAlbum | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState<StudioAlbum | null>(null);
  const [deleteAlbumBusy, setDeleteAlbumBusy] = useState(false);

  const loadMyAlbums = useCallback(async () => {
    setAlbumsLoading(true);
    try {
      const res = await fetch("/api/music/albums?mine=true&limit=100", { cache: "no-store" });
      if (res.ok) setAlbums(await res.json());
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!access?.allowed) return;
    loadMyTracks();
    loadMyAlbums();
  }, [access?.allowed, loadMyTracks, loadMyAlbums]);

  const applyForArtist = async () => {
    if (!applyName.trim()) return;
    setApplyBusy(true);
    const res = await fetch("/api/music/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: applyName.trim() }),
    });
    setApplyBusy(false);
    if (res.ok) {
      setApplyName("");
      loadAccess();
    }
  };

  const deleteTrack = async () => {
    if (!deletingTrack) return;
    setDeleteBusy(true);
    const res = await fetch(`/api/music/tracks/${deletingTrack.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (res.ok) {
      setTracks((prev) => prev.filter((tr) => tr.id !== deletingTrack.id));
      setDeletingTrack(null);
      setMessage({ type: "success", text: t("music.studio.trackDeletedMsg") });
      onTrackChange?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error || t("music.studio.saveFailed") });
    }
  };

  const deleteAlbum = async () => {
    if (!deletingAlbum) return;
    setDeleteAlbumBusy(true);
    const res = await fetch(`/api/music/albums/${deletingAlbum.id}`, { method: "DELETE" });
    setDeleteAlbumBusy(false);
    if (res.ok) {
      setAlbums((prev) => prev.filter((al) => al.id !== deletingAlbum.id));
      setDeletingAlbum(null);
      setMessage({ type: "success", text: t("music.studio.albumDeletedMsg") });
      loadMyTracks();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error || t("music.studio.saveFailed") });
    }
  };

  return (
    <section className="rounded-[24px] border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.035] p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">
            {t("music.shell.studioEyebrow")}
          </div>
          <h2 className="text-2xl font-black mt-1">{t("music.shell.studioLabel")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("music.shell.studioDescription")}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
        >
          {t("music.shell.close")}
        </button>
      </div>

      {message && (
        <div
          role="status"
          className={`mb-5 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40"
          }`}
        >
          {message.text}
        </div>
      )}

      {!session?.user ? (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 p-6 text-center">
          <Lock className="w-8 h-8 mx-auto text-gray-400" />
          <div className="font-bold mt-3">{t("music.shell.signInTitle")}</div>
          <p className="text-sm text-gray-500 mt-1">{t("music.shell.signInBody")}</p>
        </div>
      ) : accessLoading ? (
        <div className="py-10 flex justify-center">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-zrp-red border-t-transparent" />
        </div>
      ) : !access?.allowed ? (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <div className="font-bold">{t("music.shell.gateTitle")}</div>
              <p className="text-sm text-gray-500 mt-1">{t("music.shell.gateBody")}</p>
            </div>
          </div>

          {access?.hasArtistProfile ? (
            <div className="mt-5 text-sm rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 p-3.5">
              {t("music.shell.pendingVerification")}
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-gray-500 mb-2">
                {t("music.shell.applyIntroPrefix")}
                <Link href="/settings" className="text-zrp-red hover:underline"> {t("music.shell.applyIntroLink")}</Link> {t("music.shell.applyIntroSuffix")}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={applyName}
                  onChange={(e) => setApplyName(e.target.value)}
                  placeholder={t("music.shell.artistNamePlaceholder")}
                  className="flex-1 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
                />
                <button
                  type="button"
                  disabled={applyBusy || !applyName.trim()}
                  onClick={applyForArtist}
                  className="h-11 px-5 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40 shrink-0"
                >
                  {applyBusy ? t("music.shell.applySubmitting") : t("music.shell.applySubmit")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1.5 mb-6 overflow-x-auto no-scrollbar">
            {([
              ["tracks", t("music.studio.tabTracks"), Music2],
              ["albums", t("music.studio.tabAlbums"), Disc3],
              ["artist", t("music.studio.tabArtist"), UserIcon],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`shrink-0 h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 transition ${
                  tab === key
                    ? "bg-zrp-red text-white"
                    : "bg-white dark:bg-white/[0.05] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === "tracks" && (
            <TracksTab
              tracks={tracks}
              tracksLoading={tracksLoading}
              onEdit={setEditingTrack}
              onDelete={setDeletingTrack}
              onPublished={() => {
                loadMyTracks();
                onTrackChange?.();
              }}
            />
          )}

          {tab === "albums" && (
            <AlbumsTab
              albums={albums}
              albumsLoading={albumsLoading}
              onCreate={() => setCreatingAlbum(true)}
              onManage={setManagingAlbum}
              onDelete={setDeletingAlbum}
            />
          )}

          {tab === "artist" && <ArtistTab onSaved={loadAccess} />}
        </>
      )}

      {editingTrack && (
        <EditTrackModal
          track={editingTrack}
          albums={albums}
          onClose={() => setEditingTrack(null)}
          onSaved={(updated) => {
            setTracks((prev) => prev.map((tr) => (tr.id === updated.id ? { ...tr, ...updated } : tr)));
            setEditingTrack(null);
            setMessage({ type: "success", text: t("music.studio.trackUpdatedMsg") });
            onTrackChange?.();
          }}
        />
      )}

      {deletingTrack && (
        <ModalShell title={t("music.studio.deleteTrackTitle")} onClose={() => setDeletingTrack(null)}>
          <div className="flex items-start gap-3 mb-5">
            <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t("music.studio.deleteTrackBody", { title: deletingTrack.title })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeletingTrack(null)}
              className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-white/10 font-semibold"
            >
              {t("music.studio.cancel")}
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={deleteTrack}
              className="flex-1 h-11 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40"
            >
              {deleteBusy ? t("music.studio.deleting") : t("music.studio.deleteConfirm")}
            </button>
          </div>
        </ModalShell>
      )}

      {creatingAlbum && (
        <CreateAlbumModal
          onClose={() => setCreatingAlbum(false)}
          onCreated={(album) => {
            setAlbums((prev) => [album, ...prev]);
            setCreatingAlbum(false);
            setMessage({ type: "success", text: t("music.studio.albumCreatedMsg") });
          }}
        />
      )}

      {managingAlbum && (
        <ManageAlbumModal
          album={managingAlbum}
          allTracks={tracks}
          onClose={() => setManagingAlbum(null)}
          onAlbumSaved={(updated) => {
            setAlbums((prev) => prev.map((al) => (al.id === updated.id ? { ...al, ...updated } : al)));
            setMessage({ type: "success", text: t("music.studio.albumUpdatedMsg") });
          }}
          onTracksChanged={() => {
            loadMyTracks();
            loadMyAlbums();
          }}
        />
      )}

      {deletingAlbum && (
        <ModalShell title={t("music.studio.deleteAlbumTitle")} onClose={() => setDeletingAlbum(null)}>
          <div className="flex items-start gap-3 mb-5">
            <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t("music.studio.deleteAlbumBody", { title: deletingAlbum.title })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeletingAlbum(null)}
              className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-white/10 font-semibold"
            >
              {t("music.studio.cancel")}
            </button>
            <button
              type="button"
              disabled={deleteAlbumBusy}
              onClick={deleteAlbum}
              className="flex-1 h-11 rounded-xl bg-red-600 text-white font-bold disabled:opacity-40"
            >
              {deleteAlbumBusy ? t("music.studio.deleting") : t("music.studio.deleteConfirm")}
            </button>
          </div>
        </ModalShell>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// TRACKS TAB (upload + manage)
// ─────────────────────────────────────────────────────────────────
function TracksTab({
  tracks,
  tracksLoading,
  onEdit,
  onDelete,
  onPublished,
}: {
  tracks: StudioTrack[];
  tracksLoading: boolean;
  onEdit: (track: StudioTrack) => void;
  onDelete: (track: StudioTrack) => void;
  onPublished: () => void;
}) {
  const { t } = useLanguage();
  const [artistName, setArtistName] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [explicit, setExplicit] = useState(false);
  const [audio, setAudio] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Distinct from `busy` so the button/hint can say "Checking file..."
  // during the pre-flight readability check instead of "Publishing...",
  // since that check can now legitimately take up to a minute for a
  // cloud-storage file (see verifyFileReadable) and looking identical
  // to a normal publish made it easy to mistake for a freeze.
  const [verifying, setVerifying] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Kept separate from the upload itself: once the (potentially very
  // large, slow-on-mobile) file transfer finishes, the actual audioUrl/
  // key are stashed here. If the publish step after it (creating the
  // artist + MusicTrack rows) then fails - a real risk on a mobile
  // connection that drops right as someone switches apps mid-upload -
  // Retry re-runs publish() from this stashed data instead of forcing
  // the huge file to be re-uploaded from scratch.
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const publish = useCallback(
    async (uploaded: PendingUpload) => {
      setUploadError(null);
      try {
        const artistRes = await fetch("/api/music/artists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: artistName || undefined }),
        });
        if (!artistRes.ok) throw new Error(t("music.shell.publishFailedDefault"));
        const artist = await artistRes.json();

        const trackRes = await fetch("/api/music/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, genre, explicit,
            audioUrl: uploaded.audioUrl, audioKey: uploaded.audioKey,
            coverUrl: uploaded.coverUrl ?? null, coverKey: uploaded.coverKey ?? null,
            durationSec: uploaded.durationSec ?? null,
            artistId: artist.id,
          }),
        });
        if (!trackRes.ok) {
          const data = await trackRes.json().catch(() => ({}));
          throw new Error(data.error || t("music.shell.publishFailedDefault"));
        }

        setPendingUpload(null);
        setBusy(false);
        setAudio(null);
        setDurationSec(null);
        setCover(null);
        setTitle("");
        setGenre("");
        setExplicit(false);
        onPublished();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : t("music.shell.publishFailedDefault"));
        setBusy(false);
        // pendingUpload deliberately kept so Retry doesn't re-upload.
      }
    },
    [artistName, title, genre, explicit, t, onPublished]
  );

  const { startUpload: uploadMusic } = useUploadThing("musicTrack", {
    onClientUploadComplete: async (files) => {
      if (!files?.length) {
        setBusy(false);
        return;
      }
      const audioFile = files.find((f) => f.serverData?.type === "audio") || files[0];
      const imageFile = files.find((f) => f.serverData?.type === "image");
      const uploaded: PendingUpload = {
        audioUrl: audioFile.ufsUrl,
        audioKey: audioFile.key,
        coverUrl: imageFile?.ufsUrl ?? null,
        coverKey: imageFile?.key ?? null,
        durationSec,
      };
      setPendingUpload(uploaded);
      await publish(uploaded);
    },
    onUploadError: (err) => {
      setUploadError(err.message || t("music.shell.uploadFailedDefault"));
      setBusy(false);
    },
  });

  const submit = async () => {
    if (pendingUpload) {
      setBusy(true);
      await publish(pendingUpload);
      return;
    }

    if (!audio || !title) return;
    setUploadError(null);

    const emptyFile = [audio, cover].find((f) => f && f.size === 0);
    if (emptyFile) {
      setUploadError(t("music.shell.emptyFileError", { name: emptyFile.name }));
      return;
    }

    setBusy(true);

    const filesToVerify = cover ? [audio, cover] : [audio];
    setVerifying(true);
    for (const file of filesToVerify) {
      const readable = await verifyFileReadable(file);
      if (!readable) {
        setVerifying(false);
        setUploadError(t("music.shell.unreadableFileError", { name: file.name }));
        setBusy(false);
        return;
      }
    }
    setVerifying(false);

    const files = cover ? [audio, cover] : [audio];
    await uploadMusic(files);
  };

  const discardPending = () => {
    setPendingUpload(null);
    setAudio(null);
    setDurationSec(null);
    setCover(null);
    setUploadError(null);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-5">
        <h3 className="font-bold mb-4">{t("music.shell.uploadMusic")}</h3>

        {pendingUpload ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 p-4 mb-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("music.studio.uploadDoneRetryPublish")}
            </p>
          </div>
        ) : null}

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder={t("music.shell.artistNamePlaceholder")}
            disabled={!!pendingUpload}
            className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50 disabled:opacity-50"
          />

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("music.shell.songTitlePlaceholder")}
            className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
          />

          <div>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder={t("music.shell.genrePlaceholder")}
              list="zrp-genre-list-upload"
              className="w-full p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
            />
            {/* A suggestion list, not a closed vocabulary - genre stays
                free text underneath so an artist can still type
                anything that isn't on this list. */}
            <datalist id="zrp-genre-list-upload">
              {MUSIC_GENRES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <label className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={explicit}
              onChange={(e) => setExplicit(e.target.checked)}
              className="w-4 h-4 accent-zrp-red"
            />
            {t("music.studio.explicitLabel")}
          </label>

          {!pendingUpload && (
            <>
              <label className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 cursor-pointer text-sm text-gray-500">
                {t("music.shell.audioFileLabel")}
                <input
                  type="file"
                  // No accept restriction, deliberately - a cloud
                  // storage app's own file picker (MEGA, Google Drive,
                  // Dropbox) frequently doesn't tag a file with any of
                  // the MIME types listed here (often reporting a
                  // generic type, or none, until the file is actually
                  // downloaded), and both Android's and iOS's system
                  // pickers grey out / hide files that don't match an
                  // accept filter - before this code ever runs. That
                  // silently made real audio files unselectable from
                  // exactly the providers people use most. accept is a
                  // UX hint, not a security boundary; the real
                  // validation happens after selection (the empty/
                  // unreadable-file checks below) and server-side
                  // (isAudioFile() in the UploadThing middleware).
                  className="block mt-2 w-full text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAudio(file);
                    setDurationSec(null);
                    if (file) probeAudioDuration(file).then(setDurationSec);
                  }}
                />
              </label>

              <label className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 cursor-pointer text-sm text-gray-500">
                {t("music.shell.coverArtworkLabel")}
                <input
                  type="file"
                  className="block mt-2 w-full text-xs"
                  onChange={(e) => setCover(e.target.files?.[0] || null)}
                />
              </label>
            </>
          )}

          <button
            disabled={busy || (!pendingUpload && (!audio || !title))}
            onClick={submit}
            className="sm:col-span-2 h-12 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
          >
            {busy
              ? verifying
                ? t("music.studio.checkingFile")
                : t("music.shell.publishing")
              : pendingUpload
                ? t("music.studio.retryPublish")
                : t("music.shell.publishTrack")}
          </button>

          {verifying && (
            <p className="sm:col-span-2 text-xs text-gray-500 -mt-1">
              {t("music.studio.checkingFileHint")}
            </p>
          )}

          {pendingUpload && !busy && (
            <button
              type="button"
              onClick={discardPending}
              className="sm:col-span-2 h-10 rounded-xl text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              {t("music.studio.discardUpload")}
            </button>
          )}
        </div>

        {uploadError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">
            {uploadError}
          </p>
        )}

        <p className="text-xs text-gray-500 mt-3">{t("music.shell.uploadHint")}</p>
      </div>

      <div>
        <h3 className="font-bold mb-3">{t("music.studio.myTracks")}</h3>

        {tracksLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : !tracks.length ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-10 text-center text-sm text-gray-500">
            {t("music.studio.noTracksYet")}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
            {tracks.map((track) => (
              <div key={track.id} className="flex items-center gap-3 px-3 sm:px-4 py-3">
                <img
                  src={track.coverUrl || "/logo.png"}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {track.title}
                    {track.explicit && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-white/10 text-gray-500 font-bold shrink-0">
                        {t("music.studio.explicitBadge")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {track.album?.title || t("music.studio.noAlbum")}
                    {track.genre ? ` • ${track.genre}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(track)}
                  aria-label={t("music.studio.editTrack")}
                  className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center shrink-0"
                >
                  <Pencil className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(track)}
                  aria-label={t("music.studio.deleteTrack")}
                  className="w-10 h-10 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EDIT TRACK MODAL
// ─────────────────────────────────────────────────────────────────
function EditTrackModal({
  track,
  albums,
  onClose,
  onSaved,
}: {
  track: StudioTrack;
  albums: StudioAlbum[];
  onClose: () => void;
  onSaved: (track: StudioTrack) => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(track.description || "");
  const [genre, setGenre] = useState(track.genre || "");
  const [explicit, setExplicit] = useState(track.explicit);
  const [albumId, setAlbumId] = useState(track.albumId || "");
  const [coverUrl, setCoverUrl] = useState(track.coverUrl || "");
  const [coverKey, setCoverKey] = useState(track.coverKey || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload: uploadCover, isUploading: coverUploading } = useUploadThing("musicTrack", {
    onClientUploadComplete: (files) => {
      const imageFile = files?.find((f) => f.serverData?.type === "image");
      if (imageFile) {
        setCoverUrl(imageFile.ufsUrl);
        setCoverKey(imageFile.key);
      }
    },
    onUploadError: (err) => setError(err.message || t("music.shell.uploadFailedDefault")),
  });

  const save = async () => {
    if (!title.trim()) {
      setError(t("music.studio.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/music/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        explicit,
        coverUrl: coverUrl || null,
        coverKey: coverKey || null,
        albumId: albumId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("music.studio.saveFailed"));
      return;
    }
    const updated = await res.json();
    onSaved(updated);
  };

  return (
    <ModalShell title={t("music.studio.editTrack")} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <img src={coverUrl || "/logo.png"} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          <label className="flex-1 h-11 rounded-xl border border-dashed border-gray-300 dark:border-white/15 flex items-center justify-center gap-2 text-sm text-gray-500 cursor-pointer">
            <ImagePlus className="w-4 h-4" />
            {coverUploading ? t("music.studio.uploading") : t("music.studio.changeCover")}
            <input
              type="file"
              className="hidden"
              disabled={coverUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover([file]);
              }}
            />
          </label>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("music.shell.songTitlePlaceholder")}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("music.studio.descriptionPlaceholder")}
          rows={3}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50 resize-none"
        />

        <input
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder={t("music.shell.genrePlaceholder")}
          list="zrp-genre-list-edit"
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        />
        <datalist id="zrp-genre-list-edit">
          {MUSIC_GENRES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <select
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        >
          <option value="">{t("music.studio.noAlbum")}</option>
          {albums.map((al) => (
            <option key={al.id} value={al.id}>
              {al.title}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 cursor-pointer">
          <input
            type="checkbox"
            checked={explicit}
            onChange={(e) => setExplicit(e.target.checked)}
            className="w-4 h-4 accent-zrp-red"
          />
          {t("music.studio.explicitLabel")}
        </label>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-white/10 font-semibold"
          >
            {t("music.studio.cancel")}
          </button>
          <button
            type="button"
            disabled={saving || coverUploading}
            onClick={save}
            className="flex-1 h-11 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
          >
            {saving ? t("music.studio.saving") : t("music.studio.save")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// ALBUMS TAB
// ─────────────────────────────────────────────────────────────────
function AlbumsTab({
  albums,
  albumsLoading,
  onCreate,
  onManage,
  onDelete,
}: {
  albums: StudioAlbum[];
  albumsLoading: boolean;
  onCreate: () => void;
  onManage: (album: StudioAlbum) => void;
  onDelete: (album: StudioAlbum) => void;
}) {
  const { t } = useLanguage();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">{t("music.studio.myAlbums")}</h3>
        <button
          type="button"
          onClick={onCreate}
          className="h-10 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {t("music.studio.createAlbum")}
        </button>
      </div>

      {albumsLoading ? (
        <div className="py-8 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-zrp-red border-t-transparent" />
        </div>
      ) : !albums.length ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-10 text-center text-sm text-gray-500">
          {t("music.studio.noAlbumsYet")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {albums.map((album) => (
            <div
              key={album.id}
              className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden"
            >
              <div className="aspect-square bg-gray-100 dark:bg-white/5">
                <img src={album.coverUrl || "/logo.png"} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="p-3.5">
                <div className="font-bold truncate">{album.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t(album._count?.tracks === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: album._count?.tracks || 0 })}
                  {!!album.totalDurationSec && ` • ${formatTotalDuration(album.totalDurationSec, t)}`}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => onManage(album)}
                    className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-white/10 text-xs font-bold"
                  >
                    {t("music.studio.manage")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(album)}
                    aria-label={t("music.studio.deleteAlbum")}
                    className="w-9 h-9 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CREATE ALBUM MODAL
// ─────────────────────────────────────────────────────────────────
function CreateAlbumModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (album: StudioAlbum) => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverKey, setCoverKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload: uploadCover, isUploading: coverUploading } = useUploadThing("musicTrack", {
    onClientUploadComplete: (files) => {
      const imageFile = files?.find((f) => f.serverData?.type === "image");
      if (imageFile) {
        setCoverUrl(imageFile.ufsUrl);
        setCoverKey(imageFile.key);
      }
    },
    onUploadError: (err) => setError(err.message || t("music.shell.uploadFailedDefault")),
  });

  const create = async () => {
    if (!title.trim()) {
      setError(t("music.studio.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const artistRes = await fetch("/api/music/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!artistRes.ok) throw new Error(t("music.studio.saveFailed"));
      const artist = await artistRes.json();

      const res = await fetch("/api/music/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: artist.id,
          title: title.trim(),
          description: description.trim() || null,
          coverUrl: coverUrl || null,
          coverKey: coverKey || null,
          releaseDate: releaseDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("music.studio.saveFailed"));
      }
      const album = await res.json();
      onCreated(album);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("music.studio.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={t("music.studio.createAlbum")} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <img src={coverUrl || "/logo.png"} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          <label className="flex-1 h-11 rounded-xl border border-dashed border-gray-300 dark:border-white/15 flex items-center justify-center gap-2 text-sm text-gray-500 cursor-pointer">
            <ImagePlus className="w-4 h-4" />
            {coverUploading ? t("music.studio.uploading") : t("music.studio.addCover")}
            <input
              type="file"
              className="hidden"
              disabled={coverUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover([file]);
              }}
            />
          </label>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("music.studio.albumTitlePlaceholder")}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("music.studio.descriptionPlaceholder")}
          rows={3}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50 resize-none"
        />

        <label className="block text-xs text-gray-500 mb-1">{t("music.studio.releaseDate")}</label>
        <input
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        />

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-white/10 font-semibold"
          >
            {t("music.studio.cancel")}
          </button>
          <button
            type="button"
            disabled={saving || coverUploading}
            onClick={create}
            className="flex-1 h-11 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
          >
            {saving ? t("music.studio.saving") : t("music.studio.createAlbum")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// MANAGE ALBUM MODAL (edit metadata, add/remove/reorder tracks)
// ─────────────────────────────────────────────────────────────────
function ManageAlbumModal({
  album,
  allTracks,
  onClose,
  onAlbumSaved,
  onTracksChanged,
}: {
  album: StudioAlbum;
  allTracks: StudioTrack[];
  onClose: () => void;
  onAlbumSaved: (album: StudioAlbum) => void;
  onTracksChanged: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description || "");
  const [releaseDate, setReleaseDate] = useState(album.releaseDate ? album.releaseDate.slice(0, 10) : "");
  const [coverUrl, setCoverUrl] = useState(album.coverUrl || "");
  const [coverKey, setCoverKey] = useState(album.coverKey || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const [albumTracks, setAlbumTracks] = useState<StudioTrack[]>(
    allTracks
      .filter((tr) => tr.albumId === album.id)
      .sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999))
  );
  const availableTracks = allTracks.filter((tr) => tr.albumId !== album.id);

  const { startUpload: uploadCover, isUploading: coverUploading } = useUploadThing("musicTrack", {
    onClientUploadComplete: (files) => {
      const imageFile = files?.find((f) => f.serverData?.type === "image");
      if (imageFile) {
        setCoverUrl(imageFile.ufsUrl);
        setCoverKey(imageFile.key);
      }
    },
    onUploadError: (err) => setError(err.message || t("music.shell.uploadFailedDefault")),
  });

  const saveMetadata = async () => {
    if (!title.trim()) {
      setError(t("music.studio.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/music/albums/${album.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        coverUrl: coverUrl || null,
        coverKey: coverKey || null,
        releaseDate: releaseDate || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("music.studio.saveFailed"));
      return;
    }
    const updated = await res.json();
    onAlbumSaved(updated);
  };

  const addTrack = async (track: StudioTrack) => {
    const res = await fetch(`/api/music/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId: album.id, trackNumber: albumTracks.length + 1 }),
    });
    if (res.ok) {
      setAlbumTracks((prev) => [...prev, { ...track, albumId: album.id }]);
      onTracksChanged();
    }
  };

  const removeTrack = async (track: StudioTrack) => {
    const res = await fetch(`/api/music/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId: null }),
    });
    if (res.ok) {
      setAlbumTracks((prev) => prev.filter((tr) => tr.id !== track.id));
      onTracksChanged();
    }
  };

  const persistOrder = async (ordered: StudioTrack[]) => {
    setReordering(true);
    await fetch(`/api/music/albums/${album.id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedTrackIds: ordered.map((tr) => tr.id) }),
    }).catch(() => {});
    setReordering(false);
    onTracksChanged();
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= albumTracks.length) return;
    const next = [...albumTracks];
    [next[index], next[target]] = [next[target], next[index]];
    setAlbumTracks(next);
    persistOrder(next);
  };

  return (
    <ModalShell title={t("music.studio.manageAlbum")} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img src={coverUrl || "/logo.png"} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
            <label className="flex-1 h-11 rounded-xl border border-dashed border-gray-300 dark:border-white/15 flex items-center justify-center gap-2 text-sm text-gray-500 cursor-pointer">
              <ImagePlus className="w-4 h-4" />
              {coverUploading ? t("music.studio.uploading") : t("music.studio.changeCover")}
              <input
                type="file"
                className="hidden"
                disabled={coverUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCover([file]);
                }}
              />
            </label>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("music.studio.albumTitlePlaceholder")}
            className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("music.studio.descriptionPlaceholder")}
            rows={2}
            className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50 resize-none"
          />

          <input
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
          />

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="button"
            disabled={saving || coverUploading}
            onClick={saveMetadata}
            className="w-full h-11 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
          >
            {saving ? t("music.studio.saving") : t("music.studio.save")}
          </button>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
            {t("music.studio.tracksInAlbum")}
            {reordering && <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-zrp-red border-t-transparent" />}
          </h4>
          {!albumTracks.length ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/10 py-6 text-center text-sm text-gray-500">
              {t("music.studio.noTracksInAlbum")}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              {albumTracks.map((track, index) => (
                <div key={track.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="w-5 text-center text-xs text-gray-400 shrink-0">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{track.title}</span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t("music.studio.moveUp")}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === albumTracks.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t("music.studio.moveDown")}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTrack(track)}
                    aria-label={t("music.studio.removeFromAlbum")}
                    className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {availableTracks.length > 0 && (
          <div>
            <h4 className="font-bold text-sm mb-2">{t("music.studio.addExistingTracks")}</h4>
            <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden max-h-48 overflow-y-auto">
              {availableTracks.map((track) => (
                <div key={track.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{track.title}</span>
                  <button
                    type="button"
                    onClick={() => addTrack(track)}
                    className="h-8 px-3 rounded-full bg-zrp-red/10 text-zrp-red text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("music.studio.add")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// ARTIST PROFILE TAB
// ─────────────────────────────────────────────────────────────────
function ArtistTab({ onSaved }: { onSaved: () => void }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Preload the artist's real current values before letting them
    // edit - without this, saving would silently overwrite an
    // existing bio/avatar/banner with blanks the form never loaded.
    fetch("/api/music/artists?mine=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((artist: StudioArtist | null) => {
        if (artist) {
          setDisplayName(artist.displayName || "");
          setBio(artist.bio || "");
          setAvatarUrl(artist.avatarUrl || "");
          setBannerUrl(artist.bannerUrl || "");
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const res = await fetch("/api/music/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl || null,
        bannerUrl: bannerUrl || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("music.studio.saveFailed"));
      return;
    }
    setSuccess(true);
    onSaved();
  };

  const { startUpload: uploadAvatar, isUploading: avatarUploading } = useUploadThing("avatar", {
    onClientUploadComplete: (files) => {
      if (files?.[0]) setAvatarUrl(files[0].ufsUrl);
    },
    onUploadError: (err) => setError(err.message || t("music.shell.uploadFailedDefault")),
  });

  const { startUpload: uploadBanner, isUploading: bannerUploading } = useUploadThing("banner", {
    onClientUploadComplete: (files) => {
      if (files?.[0]) setBannerUrl(files[0].ufsUrl);
    },
    onUploadError: (err) => setError(err.message || t("music.shell.uploadFailedDefault")),
  });

  if (!loaded) {
    return (
      <div className="py-10 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-white/5 h-28">
        {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover" />}
        <label className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs font-semibold cursor-pointer">
          {bannerUploading ? t("music.studio.uploading") : t("music.studio.changeBanner")}
          <input
            type="file"
            className="hidden"
            disabled={bannerUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBanner([file]);
            }}
          />
        </label>

        <label className="absolute -bottom-6 left-4 w-16 h-16 rounded-2xl border-4 border-white dark:border-[#0a0a0a] bg-gray-200 dark:bg-white/10 overflow-hidden cursor-pointer">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-gray-400" />
            </div>
          )}
          <input
            type="file"
            className="hidden"
            disabled={avatarUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar([file]);
            }}
          />
        </label>
      </div>

      <div className="pt-5">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("music.shell.artistNamePlaceholder")}
          className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
        />
      </div>

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder={t("music.studio.bioPlaceholder")}
        rows={4}
        className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50 resize-none"
      />

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <Check className="w-4 h-4" />
          {t("music.studio.artistProfileSaved")}
        </p>
      )}

      <button
        type="button"
        disabled={saving || avatarUploading || bannerUploading}
        onClick={save}
        className="h-11 px-6 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
      >
        {saving ? t("music.studio.saving") : t("music.studio.save")}
      </button>
    </div>
  );
}
