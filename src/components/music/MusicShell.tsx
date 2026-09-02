"use client";

import { useEffect, useState } from "react";
import { Heart, ListPlus, Play, Search, UploadCloud } from "lucide-react";
import { useMusicPlayer, type MusicTrack } from "./MusicPlayerProvider";
import { useUploadThing } from "@/lib/uploadthing-client";

export default function MusicShell() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [q, setQ] = useState("");
  const [studio, setStudio] = useState(false);
  const [artistName, setArtistName] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { play, addToQueue } = useMusicPlayer();
  const { startUpload: uploadMusic } = useUploadThing("musicTrack", {
    onClientUploadComplete: async (files) => {
      if (!files?.length) return;
      const audioFile = files.find(f => f.serverData?.type === "audio") || files[0];
      const imageFile = files.find(f => f.serverData?.type === "image");
      const artistRes = await fetch("/api/music/artists", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ displayName: artistName || undefined }),
      });
      const artist = await artistRes.json();
      await fetch("/api/music/tracks", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ title, genre, audioUrl: audioFile.ufsUrl, audioKey: audioFile.key, coverUrl: imageFile?.ufsUrl || null, artistId: artist.id }),
      });
      setBusy(false); setAudio(null); setCover(null); setTitle(""); setStudio(false);
      load();
    },
    onUploadError: () => setBusy(false),
  });

  async function load() {
    const res = await fetch(`/api/music/tracks${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
    if (res.ok) setTracks(await res.json());
  }
  useEffect(() => { load(); }, [q]);

  const submit = async () => {
    if (!audio || !title) return;
    setBusy(true);
    const files = cover ? [audio, cover] : [audio];
    await uploadMusic(files);
  };

  const like = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({trackId:id})});
    if (res.ok) load();
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-zrp-deepBlack/90 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="flex gap-3 items-center max-w-5xl mx-auto">
          <div className="font-black text-2xl tracking-tight"><span className="text-zrp-red">ZRP</span> Music</div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search songs, artists, genres..." className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-900 outline-none"/>
          </div>
          <button onClick={()=>setStudio(v=>!v)} className="bg-zrp-red text-white rounded-full px-4 py-2 flex items-center gap-2"><UploadCloud className="w-4 h-4"/><span className="hidden sm:inline">Music Studio</span></button>
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {studio && (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-950">
            <h2 className="text-xl font-bold mb-4">Upload music</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={artistName} onChange={e=>setArtistName(e.target.value)} placeholder="Artist name" className="p-3 rounded-xl bg-gray-100 dark:bg-gray-900"/>
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Song title" className="p-3 rounded-xl bg-gray-100 dark:bg-gray-900"/>
              <input value={genre} onChange={e=>setGenre(e.target.value)} placeholder="Genre" className="p-3 rounded-xl bg-gray-100 dark:bg-gray-900"/>
              <label className="p-3 rounded-xl bg-gray-100 dark:bg-gray-900 cursor-pointer">Audio (MP3/WAV/etc.)<input type="file" accept=".mp3,.wav,.m4a,.aac,.aiff,.flac,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/aiff,audio/flac,audio/ogg" className="block mt-2 w-full" onChange={e=>setAudio(e.target.files?.[0]||null)}/></label>
              <label className="p-3 rounded-xl bg-gray-100 dark:bg-gray-900 cursor-pointer">Cover<input type="file" accept="image/*" className="block mt-2 w-full" onChange={e=>setCover(e.target.files?.[0]||null)}/></label>
            </div>
            <button disabled={busy || !audio || !title} onClick={submit} className="mt-4 px-5 py-3 rounded-full bg-zrp-red text-white font-bold disabled:opacity-50">{busy ? "Uploading..." : "Publish song"}</button>
            <p className="text-xs text-gray-500 mt-2">Audio and artwork are uploaded directly to your existing UploadThing storage.</p>
          </section>
        )}

        <section>
          <h1 className="text-2xl font-bold mb-3">Discover</h1>
          <div className="space-y-2">
            {tracks.map(track => (
              <div key={track.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-900">
                <img src={track.coverUrl || track.album?.coverUrl || "/logo.png"} alt="" className="w-14 h-14 rounded-xl object-cover"/>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{track.title}</div>
                  <div className="text-sm text-gray-500 truncate">{track.artist.displayName}{track.genre ? ` • ${track.genre}` : ""}</div>
                </div>
                <button onClick={()=>play(track)} className="w-10 h-10 rounded-full bg-zrp-red text-white flex items-center justify-center"><Play className="w-5 h-5"/></button>
                <button onClick={()=>addToQueue(track)} aria-label="Add to queue"><ListPlus className="w-5 h-5"/></button>
                <button onClick={()=>like(track.id)} aria-label="Like"><Heart className={`w-5 h-5 ${track.liked ? "fill-zrp-red text-zrp-red" : ""}`}/></button>
              </div>
            ))}
            {!tracks.length && <div className="py-16 text-center text-gray-500">No published music yet. Upload the first song from Music Studio.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
