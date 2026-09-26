"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Radio, Plus, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar } from "@/components/ui/avatar";
import CreateLiveAudioModal from "@/components/live-audio/CreateLiveAudioModal";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface LiveAudioRoomSummary {
  id: string;
  title: string;
  category: string | null;
  host: { id: string; username: string; name: string | null; avatarUrl: string | null };
  community: { id: string; name: string; slug: string } | null;
  listenerCount: number;
}

export default function LiveAudioDiscoveryPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const router = useRouter();
  const [rooms, setRooms] = useState<LiveAudioRoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/live-audio/rooms")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("liveAudio.errorLoadingRooms"));
        setRooms(data.rooms ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t("liveAudio.errorLoadingRooms"));
        setRooms([]);
      });
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-6 h-6 text-zrp-red shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-orbitron font-extrabold text-gray-900 dark:text-white truncate">
            {t("liveAudio.pageTitle")}
          </h1>
        </div>
        {session?.user && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-zrp-darkRed transition text-sm shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t("liveAudio.goLive")}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("liveAudio.subtitle")}</p>

      {rooms === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[76px] rounded-2xl border border-gray-200 dark:border-gray-800 animate-pulse bg-gray-100 dark:bg-white/5"
            />
          ))}
        </div>
      )}

      {rooms !== null && error && rooms.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-600 dark:text-gray-300 mb-3">{error}</p>
          <button type="button" onClick={load} className="text-sm font-semibold text-zrp-red hover:underline">
            {t("action.retry")}
          </button>
        </div>
      )}

      {rooms !== null && !error && rooms.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
          <Radio className="w-8 h-8 mx-auto text-gray-400 mb-3" aria-hidden="true" />
          <p className="font-semibold text-gray-900 dark:text-white">{t("liveAudio.noRoomsTitle")}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("liveAudio.noRoomsDesc")}</p>
        </div>
      )}

      {rooms !== null && rooms.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                href={`/live-audio/${room.id}`}
                className="flex items-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-zrp-red transition bg-white dark:bg-zrp-charcoal"
              >
                <Avatar
                  src={room.host.avatarUrl}
                  alt=""
                  name={room.host.name || room.host.username}
                  className="w-11 h-11"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-zrp-red">
                      <span className="w-1.5 h-1.5 rounded-full bg-zrp-red animate-pulse" aria-hidden="true" />
                      {t("liveAudio.liveNow")}
                    </span>
                    {room.community && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {room.community.name}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{room.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {t("liveAudio.hostedBy", { name: room.host.name || room.host.username })}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 shrink-0">
                  <Users className="w-4 h-4" aria-hidden="true" />
                  {t("liveAudio.listenerCount", { n: room.listenerCount })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateLiveAudioModal
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => router.push(`/live-audio/${roomId}`)}
        />
      )}
    </div>
  );
}
