"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Room as LiveKitRoom } from "livekit-client";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Hand, Check, X, UserMinus,
  ArrowUpCircle, ArrowDownCircle, Loader2, ChevronLeft,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar } from "@/components/ui/avatar";
import ConfirmModal from "@/components/ConfirmModal";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import { getSocket } from "@/lib/socket-client";
import LiveGiftPanel from "@/components/live/LiveGiftPanel";
import LiveChatPanel from "@/components/live/LiveChatPanel";
import LiveReactionButton from "@/components/live/LiveReactionButton";
import LiveReminderButton from "@/components/live/LiveReminderButton";
import LiveReplayControls from "@/components/live/LiveReplayControls";

type ParticipantRole = "LISTENER" | "SPEAKER" | "MODERATOR" | "HOST";

interface ParticipantInfo {
  role: ParticipantRole;
  isMuted: boolean;
  isCameraOff: boolean;
  isChatMuted?: boolean;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null };
}

interface RoomDetail {
  room: {
    id: string;
    title: string;
    description: string | null;
    hostId: string;
    status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
    scheduledAt: string | null;
    slowModeSeconds: number;
    reactionCount: number;
  };
  participants: ParticipantInfo[];
  pendingRequestCount: number;
  myRole: ParticipantRole | null;
}

const isAuthority = (role: ParticipantRole | null) => role === "HOST" || role === "MODERATOR";
const canPublish = (role: ParticipantRole | null) => role === "HOST" || role === "MODERATOR" || role === "SPEAKER";

/*
 * Direct structural mirror of src/app/live-audio/[id]/page.tsx - same
 * join/leave/reconnect/moderation flow, same error handling, same
 * generic liveAudio.* copy reuse (see CreateLiveVideoModal's comment).
 * The real difference is media: every on-camera participant gets a
 * video tile (not just a hidden audio sink), and there's a second,
 * independently toggleable track (camera) alongside the mic.
 */
export default function LiveVideoRoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const { t, language } = useLanguage();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const myUserId = session?.user?.id;

  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "error">("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  // Which participants currently have an actually-subscribed video
  // track, independent of isCameraOff (a moderator-forced flag): a
  // participant who simply hasn't turned their camera on yet has
  // isCameraOff === false but no track at all, and must still show an
  // avatar fallback rather than an empty tile.
  const [activeVideoIds, setActiveVideoIds] = useState<Set<string>>(new Set());
  const [pendingRequesterIds, setPendingRequesterIds] = useState<string[]>([]);
  const [requestSent, setRequestSent] = useState(false);
  const [ended, setEnded] = useState<"ended" | "removed" | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const livekitRoomRef = useRef<LiveKitRoom | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  // Each on-camera participant's tile registers its own container div
  // here (keyed by userId/LiveKit identity) so an attached video
  // element can be appended to the right tile regardless of render
  // order - a plain ref can't do this for a dynamically-sized list.
  const videoContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerVideoContainer = useCallback((userId: string) => (el: HTMLDivElement | null) => {
    if (el) videoContainersRef.current.set(userId, el);
    else videoContainersRef.current.delete(userId);
  }, []);

  const loadDetail = useCallback(() => {
    fetch(`/api/live-video/rooms/${roomId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw Object.assign(new Error(localizeApiMessage(data?.error, t) || t("liveAudio.roomNotFound")), {
            code: data?.code,
          });
        }
        setDetail(data);
        setPendingRequesterIds((prev) => prev.filter((id) => id !== myUserId));
      })
      .catch((err: Error & { code?: string }) => {
        setLoadError(err.message);
      });
  }, [roomId, t, myUserId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !myUserId) return;
    const uid = myUserId;
    let cancelled = false;
    let joinedSuccessfully = false;

    const onParticipantJoined = () => loadDetail();
    const onParticipantLeft = () => loadDetail();
    const onParticipantRemoved = (payload: { userId: string }) => {
      if (payload.userId !== myUserId) loadDetail();
    };
    const onRoleChanged = (payload: { userId: string; role: ParticipantRole }) => {
      loadDetail();
      if (payload.userId === myUserId) void reconnectWithFreshToken();
    };
    const onMuteChanged = (payload: { userId: string; isMuted: boolean }) => {
      loadDetail();
      if (payload.userId === myUserId && payload.isMuted) {
        livekitRoomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        setMicEnabled(false);
      }
    };
    const onCameraChanged = (payload: { userId: string; isCameraOff: boolean }) => {
      loadDetail();
      if (payload.userId === myUserId && payload.isCameraOff) {
        livekitRoomRef.current?.localParticipant.setCameraEnabled(false).catch(() => {});
        setCamEnabled(false);
      }
    };
    const onRoomEnded = () => {
      setEnded("ended");
      livekitRoomRef.current?.disconnect();
    };
    const onYouWereRemoved = () => {
      setEnded("removed");
      livekitRoomRef.current?.disconnect();
    };
    const onSpeakerRequest = (payload: { userId: string }) => {
      setPendingRequesterIds((prev) => (prev.includes(payload.userId) ? prev : [...prev, payload.userId]));
    };

    async function reconnectWithFreshToken() {
      const room = livekitRoomRef.current;
      if (!room) return;
      try {
        const res = await fetch(`/api/live-video/rooms/${roomId}/token`, { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!res.ok) return;
        await room.connect(data.livekitUrl, data.token);
      } catch {
        // Best-effort - the room stays connected on its previous grants
        // until the next natural reconnect picks up the new token.
      }
    }

    async function run() {
      setConnection("connecting");
      try {
        const joinRes = await fetch(`/api/live-video/rooms/${roomId}/join`, { method: "POST" });
        const joinData = await joinRes.json().catch(() => null);
        if (!joinRes.ok) {
          const message =
            joinData?.code === "not_configured"
              ? t("liveVideo.notConfigured")
              : localizeApiMessage(joinData?.error, t) || t("liveAudio.joinError");
          throw new Error(message);
        }
        if (cancelled) return;

        const { Room, RoomEvent, Track } = await import("livekit-client");
        const room = new Room();
        livekitRoomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.autoplay = true;
            audioContainerRef.current?.appendChild(el);
          } else if (track.kind === Track.Kind.Video) {
            const container = videoContainersRef.current.get(participant.identity);
            if (!container) return;
            const el = track.attach() as HTMLVideoElement;
            el.autoplay = true;
            el.muted = true; // audio comes from the separate audio track above, never doubled here
            el.playsInline = true;
            el.className = "w-full h-full object-cover";
            container.appendChild(el);
            setActiveVideoIds((prev) => new Set(prev).add(participant.identity));
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          track.detach().forEach((el) => el.remove());
          if (track.kind === Track.Kind.Video) {
            setActiveVideoIds((prev) => {
              const next = new Set(prev);
              next.delete(participant.identity);
              return next;
            });
          }
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeakingIds(new Set(speakers.map((p) => p.identity)));
        });

        try {
          await room.connect(joinData.livekitUrl, joinData.token);
        } catch (connectErr) {
          // Same rationale as Live Audio's identical catch: the LiveKit
          // SDK's own error text is an internal detail, usually a
          // server-side credential/URL misconfiguration - log it, show
          // the generic translated message.
          console.error("LiveKit connect() failed:", connectErr);
          throw new Error(t("liveAudio.genericError"));
        }
        if (cancelled) {
          room.disconnect();
          return;
        }
        setConnection("connected");
        joinedSuccessfully = true;
        // The initial detail fetch races POST /join, and this client
        // never receives its own participant-joined broadcast (it joins
        // the socket channel just below) - re-read once so myRole (which
        // gates the gift/chat/reaction panels) reflects the new row.
        loadDetail();

        const socket = getSocket(uid);
        socket.emit("join-live-video-room", roomId);
        socket.on("live-video:participant-joined", onParticipantJoined);
        socket.on("live-video:participant-left", onParticipantLeft);
        socket.on("live-video:participant-removed", onParticipantRemoved);
        socket.on("live-video:role-changed", onRoleChanged);
        socket.on("live-video:mute-changed", onMuteChanged);
        socket.on("live-video:camera-changed", onCameraChanged);
        socket.on("live-video:room-ended", onRoomEnded);
        socket.on("live-video:you-were-removed", onYouWereRemoved);
        socket.on("live-video:speaker-request", onSpeakerRequest);
      } catch (err) {
        if (!cancelled) {
          setConnection("error");
          setConnectionError(err instanceof Error ? err.message : t("liveAudio.joinError"));
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
      const socket = getSocket(uid);
      socket.off("live-video:participant-joined", onParticipantJoined);
      socket.off("live-video:participant-left", onParticipantLeft);
      socket.off("live-video:participant-removed", onParticipantRemoved);
      socket.off("live-video:role-changed", onRoleChanged);
      socket.off("live-video:mute-changed", onMuteChanged);
      socket.off("live-video:camera-changed", onCameraChanged);
      socket.off("live-video:room-ended", onRoomEnded);
      socket.off("live-video:you-were-removed", onYouWereRemoved);
      socket.off("live-video:speaker-request", onSpeakerRequest);
      if (joinedSuccessfully) {
        socket.emit("leave-live-video-room", roomId);
        fetch(`/api/live-video/rooms/${roomId}/leave`, { method: "POST", keepalive: true }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, myUserId, roomId]);

  const toggleMic = async () => {
    const room = livekitRoomRef.current;
    if (!room || micBusy) return;
    setMicBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
      setMicEnabled(!micEnabled);
    } catch {
      // Permission denied or device unavailable - state simply doesn't flip.
    } finally {
      setMicBusy(false);
    }
  };

  const toggleCamera = async () => {
    const room = livekitRoomRef.current;
    if (!room || camBusy) return;
    setCamBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(!camEnabled);
      setCamEnabled(!camEnabled);
    } catch {
      // Permission denied or device unavailable - state simply doesn't flip.
    } finally {
      setCamBusy(false);
    }
  };

  const callAction = async (path: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/live-video/rooms/${roomId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("liveAudio.genericError"));
    return data;
  };

  const requestToJoin = async () => {
    try {
      await callAction("speak/request");
      setRequestSent(true);
    } catch {
      // Surfaced generically; the request button simply stays available to retry.
    }
  };

  const resolveRequest = async (userId: string, approve: boolean) => {
    setActionBusyId(userId);
    try {
      await callAction(approve ? "speak/approve" : "speak/reject", { userId });
      setPendingRequesterIds((prev) => prev.filter((id) => id !== userId));
      loadDetail();
    } catch {
      // Left in the pending list so the host can retry.
    } finally {
      setActionBusyId(null);
    }
  };

  const moderate = async (
    action: "promote" | "demote" | "mute" | "unmute" | "cameraOn" | "cameraOff" | "remove",
    userId: string
  ) => {
    setActionBusyId(userId);
    try {
      if (action === "mute" || action === "unmute") {
        await callAction("mute", { userId, muted: action === "mute" });
      } else if (action === "cameraOn" || action === "cameraOff") {
        await callAction("camera", { userId, cameraOff: action === "cameraOff" });
      } else if (action === "remove") {
        await callAction("remove", { userId });
        setConfirmRemoveId(null);
      } else {
        await callAction(action, { userId });
      }
      loadDetail();
    } catch {
      // The row's own controls remain available to retry.
    } finally {
      setActionBusyId(null);
    }
  };

  const endRoom = async () => {
    try {
      await callAction("end");
    } finally {
      setConfirmEnd(false);
    }
  };

  const leaveRoom = () => router.push("/live-video");

  if (ended) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <VideoIcon className="w-10 h-10 mx-auto text-gray-400 mb-4" aria-hidden="true" />
        <h1 className="font-orbitron text-xl font-bold text-gray-900 dark:text-white">
          {ended === "removed" ? t("liveAudio.removedTitle") : t("liveAudio.roomEndedTitle")}
        </h1>
        <button
          type="button"
          onClick={leaveRoom}
          className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-zrp-darkRed transition text-sm"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          {t("liveVideo.backToLiveVideo")}
        </button>
      </div>
    );
  }

  if (loadError && !detail) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-300 mb-4">{loadError}</p>
        <button type="button" onClick={leaveRoom} className="text-sm font-semibold text-zrp-red hover:underline">
          {t("liveVideo.backToLiveVideo")}
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex justify-center py-24" aria-busy="true">
        <Loader2 className="w-8 h-8 text-zrp-red animate-spin" />
      </div>
    );
  }

  if (detail.room.status === "SCHEDULED") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <VideoIcon className="w-10 h-10 mx-auto text-zrp-red mb-4" aria-hidden="true" />
        {detail.room.scheduledAt && (
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
            {t("liveReminders.scheduledFor", {
              time: new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(
                new Date(detail.room.scheduledAt)
              ),
            })}
          </p>
        )}
        <h1 className="font-orbitron text-xl font-bold text-gray-900 dark:text-white">{detail.room.title}</h1>
        {detail.room.description && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{detail.room.description}</p>
        )}
        {myUserId && myUserId !== detail.room.hostId && (
          <div className="mt-6">
            <LiveReminderButton roomType="VIDEO" roomId={roomId} />
          </div>
        )}
        <button
          type="button"
          onClick={leaveRoom}
          className="mt-6 inline-flex items-center gap-1 min-h-11 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          {t("liveVideo.backToLiveVideo")}
        </button>
      </div>
    );
  }

  const myRole = detail.myRole;
  const amAuthority = isAuthority(myRole);
  const iCanPublish = canPublish(myRole);
  // Gifts/chat/reactions/replay controls are authorized server-side by
  // an active participant row, which is exactly what myRole reflects.
  const showLivePanels = detail.room.status === "LIVE" && myRole !== null;

  const onCamera = detail.participants.filter((p) => p.role !== "LISTENER");
  const viewers = detail.participants.filter((p) => p.role === "LISTENER");

  const roleBadge: Record<ParticipantRole, string | null> = {
    HOST: t("liveAudio.hostBadge"),
    MODERATOR: t("liveAudio.moderatorBadge"),
    SPEAKER: null,
    LISTENER: null,
  };

  return (
    <div className={`max-w-2xl mx-auto px-4 py-6 ${showLivePanels ? "pb-44" : "pb-28"}`}>
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />

      <button
        type="button"
        onClick={leaveRoom}
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        {t("liveVideo.backToLiveVideo")}
      </button>

      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-zrp-red">
          <span className="w-1.5 h-1.5 rounded-full bg-zrp-red animate-pulse" aria-hidden="true" />
          {t("liveAudio.liveNow")}
        </span>
        {connection === "connecting" && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{t("liveAudio.connecting")}</span>
        )}
      </div>
      <h1 className="font-orbitron text-xl font-bold text-gray-900 dark:text-white">{detail.room.title}</h1>
      {detail.room.description && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail.room.description}</p>
      )}

      {connection === "error" && (
        <p role="alert" className="mt-3 text-sm text-zrp-red">
          {connectionError}
        </p>
      )}

      {amAuthority && pendingRequesterIds.length > 0 && (
        <div className="mt-5 p-4 rounded-2xl border border-zrp-red/30 bg-zrp-red/5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {t("liveVideo.pendingRequests", { n: pendingRequesterIds.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {pendingRequesterIds.map((userId) => {
              const requester = detail.participants.find((p) => p.user.id === userId);
              if (!requester) return null;
              return (
                <li key={userId} className="flex items-center gap-2">
                  <Avatar
                    src={requester.user.avatarUrl}
                    alt=""
                    name={requester.user.name || requester.user.username}
                    className="w-8 h-8"
                  />
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">
                    <bdi>@{requester.user.username}</bdi>
                  </span>
                  <button
                    type="button"
                    onClick={() => resolveRequest(userId, true)}
                    disabled={actionBusyId === userId}
                    aria-label={t("liveAudio.approve")}
                    className="p-1.5 rounded-full bg-zrp-red text-white hover:bg-zrp-darkRed transition disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveRequest(userId, false)}
                    disabled={actionBusyId === userId}
                    aria-label={t("liveAudio.decline")}
                    className="p-1.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {onCamera.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            {t("liveVideo.participantsHeading")}
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {onCamera.map((p) => {
              const isMe = p.user.id === myUserId;
              const isSpeakingNow = speakingIds.has(p.user.id) && !p.isMuted;
              return (
                <li key={p.user.id} className="flex flex-col gap-1">
                  <div
                    className={`relative aspect-video rounded-xl overflow-hidden bg-gray-900 ${
                      isSpeakingNow ? "ring-2 ring-zrp-red" : ""
                    }`}
                  >
                    {/* Always mounted so its ref registers before any
                        track arrives - the avatar fallback below is an
                        overlay on top, not a replacement, since
                        "camera off" (moderator-forced) and "no track
                        published yet" are both reasons to show it. */}
                    <div ref={registerVideoContainer(p.user.id)} className="absolute inset-0" />
                    {(p.isCameraOff || !activeVideoIds.has(p.user.id)) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                        <Avatar
                          src={p.user.avatarUrl}
                          alt=""
                          name={p.user.name || p.user.username}
                          className="w-12 h-12"
                        />
                      </div>
                    )}

                    <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between gap-1">
                      <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        <bdi>{p.user.name || p.user.username}</bdi>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.isMuted && (
                          <span className="rounded-full bg-black/60 p-1 text-white">
                            <MicOff className="w-3 h-3" aria-label={t("liveAudio.mutedLabel")} />
                          </span>
                        )}
                        {p.isCameraOff && (
                          <span className="rounded-full bg-black/60 p-1 text-white">
                            <VideoOff className="w-3 h-3" aria-label={t("liveVideo.cameraOffLabel")} />
                          </span>
                        )}
                      </div>
                    </div>

                    {roleBadge[p.role] && (
                      <span className="absolute top-1 left-1.5 rounded bg-zrp-red px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {roleBadge[p.role]}
                      </span>
                    )}

                    {amAuthority && !isMe && p.role !== "HOST" && (
                      <div className="absolute top-1 right-1.5">
                        <ParticipantMenu
                          participant={p}
                          busy={actionBusyId === p.user.id}
                          onPromote={() => moderate("promote", p.user.id)}
                          onDemote={() => moderate("demote", p.user.id)}
                          onMuteToggle={() => moderate(p.isMuted ? "unmute" : "mute", p.user.id)}
                          onCameraToggle={() => moderate(p.isCameraOff ? "cameraOn" : "cameraOff", p.user.id)}
                          onRemove={() => setConfirmRemoveId(p.user.id)}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {viewers.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            {t("liveVideo.viewersHeading")}
          </h2>
          <ul className="grid grid-cols-5 sm:grid-cols-6 gap-3">
            {viewers.map((p) => {
              const isMe = p.user.id === myUserId;
              return (
                <li key={p.user.id} className="flex flex-col items-center gap-1 text-center">
                  <div className="relative">
                    <Avatar
                      src={p.user.avatarUrl}
                      alt=""
                      name={p.user.name || p.user.username}
                      className="w-11 h-11"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-gray-900 dark:text-white truncate max-w-[56px]">
                    <bdi>{p.user.name || p.user.username}</bdi>
                  </span>
                  {amAuthority && !isMe && (
                    <ParticipantMenu
                      participant={p}
                      busy={actionBusyId === p.user.id}
                      onPromote={() => moderate("promote", p.user.id)}
                      onDemote={() => moderate("demote", p.user.id)}
                      onMuteToggle={() => moderate(p.isMuted ? "unmute" : "mute", p.user.id)}
                      onCameraToggle={() => moderate(p.isCameraOff ? "cameraOn" : "cameraOff", p.user.id)}
                      onRemove={() => setConfirmRemoveId(p.user.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(showLivePanels || detail.room.status === "ENDED") && (
        <LiveReplayControls
          roomType="VIDEO"
          roomId={roomId}
          myUserId={myUserId}
          canControl={amAuthority}
          isLive={detail.room.status === "LIVE"}
        />
      )}

      <div className="fixed bottom-0 inset-x-0 lg:left-64 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {showLivePanels && (
          <div className="max-w-2xl mx-auto flex items-center gap-2 mb-2">
            <LiveReactionButton
              roomType="VIDEO"
              roomId={roomId}
              myUserId={myUserId}
              initialCount={detail.room.reactionCount ?? 0}
            />
            <LiveGiftPanel
              roomType="VIDEO"
              roomId={roomId}
              myUserId={myUserId}
              isHost={myUserId === detail.room.hostId}
              participants={detail.participants}
            />
            <LiveChatPanel
              roomType="VIDEO"
              roomId={roomId}
              myUserId={myUserId}
              myRole={myRole}
              participants={detail.participants}
              initialSlowModeSeconds={detail.room.slowModeSeconds ?? 0}
            />
          </div>
        )}
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {iCanPublish ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                disabled={micBusy || connection !== "connected"}
                aria-label={micEnabled ? t("liveAudio.muteSelf") : t("liveAudio.unmuteSelf")}
                className={`inline-flex items-center justify-center p-2.5 rounded-full font-semibold transition disabled:opacity-50 ${
                  micEnabled
                    ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                    : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                }`}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                disabled={camBusy || connection !== "connected"}
                aria-label={camEnabled ? t("liveVideo.cameraOffSelf") : t("liveVideo.cameraOnSelf")}
                className={`inline-flex items-center justify-center p-2.5 rounded-full font-semibold transition disabled:opacity-50 ${
                  camEnabled
                    ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                    : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                }`}
              >
                {camEnabled ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
            </div>
          ) : requestSent ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">{t("liveAudio.requestSent")}</span>
          ) : (
            <button
              type="button"
              onClick={requestToJoin}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-zrp-red text-zrp-red font-semibold text-sm hover:bg-zrp-red/10 transition"
            >
              <Hand className="w-4 h-4" />
              {t("liveVideo.raiseHand")}
            </button>
          )}

          {myRole === "HOST" ? (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition"
            >
              <PhoneOff className="w-4 h-4" />
              {t("liveAudio.endRoom")}
            </button>
          ) : (
            <button
              type="button"
              onClick={leaveRoom}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition"
            >
              <PhoneOff className="w-4 h-4" />
              {t("liveAudio.leaveRoom")}
            </button>
          )}
        </div>
      </div>

      {confirmEnd && (
        <ConfirmModal
          title={t("liveAudio.endRoomConfirmTitle")}
          body={t("liveAudio.endRoomConfirmTitle")}
          confirmLabel={t("liveAudio.endRoom")}
          cancelLabel={t("action.cancel")}
          destructive
          onConfirm={endRoom}
          onCancel={() => setConfirmEnd(false)}
        />
      )}

      {confirmRemoveId && (
        <ConfirmModal
          title={t("liveAudio.removeConfirmTitle")}
          body={t("liveAudio.removeConfirmTitle")}
          confirmLabel={t("liveAudio.removeAction")}
          cancelLabel={t("action.cancel")}
          destructive
          busy={actionBusyId === confirmRemoveId}
          onConfirm={() => moderate("remove", confirmRemoveId)}
          onCancel={() => setConfirmRemoveId(null)}
        />
      )}
    </div>
  );
}

function ParticipantMenu({
  participant,
  busy,
  onPromote,
  onDemote,
  onMuteToggle,
  onCameraToggle,
  onRemove,
}: {
  participant: ParticipantInfo;
  busy: boolean;
  onPromote: () => void;
  onDemote: () => void;
  onMuteToggle: () => void;
  onCameraToggle: () => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label={t("post.moreOptions")}
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded-full bg-black/60 px-1.5 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
      >
        •••
      </button>
      {open && (
        <div
          className="absolute z-10 mt-1 right-0 w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-charcoal shadow-lg overflow-hidden text-left"
          onMouseLeave={() => setOpen(false)}
        >
          {participant.role === "LISTENER" ? (
            <MenuButton icon={ArrowUpCircle} label={t("liveVideo.inviteToSpeak")} onClick={onPromote} />
          ) : (
            <MenuButton icon={ArrowDownCircle} label={t("liveVideo.moveToViewer")} onClick={onDemote} />
          )}
          {participant.role !== "LISTENER" && (
            <>
              <MenuButton
                icon={participant.isMuted ? Mic : MicOff}
                label={participant.isMuted ? t("liveAudio.unmuteAction") : t("liveAudio.muteAction")}
                onClick={onMuteToggle}
              />
              <MenuButton
                icon={participant.isCameraOff ? VideoIcon : VideoOff}
                label={participant.isCameraOff ? t("liveVideo.cameraOnAction") : t("liveVideo.cameraOffAction")}
                onClick={onCameraToggle}
              />
            </>
          )}
          <MenuButton icon={UserMinus} label={t("liveAudio.removeAction")} onClick={onRemove} destructive />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition ${
        destructive ? "text-zrp-red" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {label}
    </button>
  );
}
