import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession, deleteUploadThingKeys } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  deleteUploadThingKeys: vi.fn(async (keys: string[]) => ({ requested: keys.length, deleted: keys.length })),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/music/permissions", () => ({
  getMusicPublishAccess: vi.fn(async () => ({ allowed: true, isCreator: true, isVerifiedArtist: false })),
  MUSIC_PUBLISH_DENIED_MESSAGE: "denied",
}));
vi.mock("@/lib/uploadthing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadthing")>();
  return { ...actual, deleteUploadThingKeys, deleteUploadThingFiles: vi.fn() };
});

import { POST as createTrack } from "../tracks/route";
import { PATCH as patchTrack, DELETE as deleteTrack } from "../tracks/[id]/route";
import { POST as createAlbum } from "../albums/route";
import { PATCH as patchAlbum, DELETE as deleteAlbum } from "../albums/[id]/route";
import { PATCH as patchPlaylist } from "../playlists/[id]/route";
import { POST as upsertArtist } from "../artists/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const GOOD_AUDIO = "https://zrp1abc.ufs.sh/f/AUDIOKEYaaaaaaaaaaaaaaaaaaaa";
const GOOD_COVER = "https://utfs.io/f/COVERKEYbbbbbbbbbbbbbbbbbbbb";
const BAD_URLS = [
  "https://evil.example/song.mp3",
  "http://utfs.io/f/plain.mp3",
  "https://localhost/f/x.mp3",
  "https://127.0.0.1/f/x.mp3",
  "https://10.1.2.3/f/x.mp3",
  "https://169.254.169.254/latest",
  "file:///etc/passwd",
  "data:audio/mp3;base64,AAAA",
  "javascript:alert(1)",
  "https://utfs.io.evil.example/f/x.mp3",
  "https://utfs.io@evil.example/f/x.mp3",
  "garbage",
];

describe.skipIf(!hasRealDatabaseUrl)("Music media trust + storage ownership (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUserWithArtist(label = "mus") {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@mediatest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "$2a$10$musictestplaceholderhash000000000000000000000000000",
        role: "USER",
      },
    });
    userIds.push(user.id);
    const artist = await prisma.musicArtist.create({ data: { userId: user.id, displayName: `Artist ${label}` } });
    return { user, artist };
  }
  const asUser = (id: string) => getServerSession.mockResolvedValue({ user: { id, username: "u", name: null } });

  beforeEach(() => {
    deleteUploadThingKeys.mockClear();
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.musicPlaylist.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.musicTrack.deleteMany({ where: { artist: { userId: { in: userIds } } } });
    await prisma.musicAlbum.deleteMany({ where: { artist: { userId: { in: userIds } } } });
    await prisma.musicArtist.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // ─── Tracks ──────────────────────────────────────────────────────
  it("POST /api/music/tracks accepts UploadThing audio + cover and derives the storage keys server-side", async () => {
    const { user, artist } = await createUserWithArtist();
    asUser(user.id);
    const res = await createTrack(
      jsonReq("https://zrp.one/api/music/tracks", "POST", {
        title: "Song", artistId: artist.id, audioUrl: GOOD_AUDIO, coverUrl: GOOD_COVER,
        audioKey: "VICTIMS_AUDIO_KEY", coverKey: "VICTIMS_COVER_KEY", // must be ignored
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.audioUrl).toBe(GOOD_AUDIO);
    expect(body.audioKey).toBe("AUDIOKEYaaaaaaaaaaaaaaaaaaaa");
    expect(body.coverKey).toBe("COVERKEYbbbbbbbbbbbbbbbbbbbb");
  });

  it("POST /api/music/tracks rejects every untrusted audio or cover URL", async () => {
    const { user, artist } = await createUserWithArtist();
    asUser(user.id);
    for (const bad of BAD_URLS) {
      const r1 = await createTrack(jsonReq("https://zrp.one/api/music/tracks", "POST", { title: "x", artistId: artist.id, audioUrl: bad }));
      expect(r1.status, `audio ${bad}`).toBe(400);
      const r2 = await createTrack(jsonReq("https://zrp.one/api/music/tracks", "POST", { title: "x", artistId: artist.id, audioUrl: GOOD_AUDIO, coverUrl: bad }));
      expect(r2.status, `cover ${bad}`).toBe(400);
    }
    expect(await prisma.musicTrack.count({ where: { artistId: artist.id } })).toBe(0);
  });

  it("PATCH /api/music/tracks/[id] rejects a new untrusted cover, accepts a trusted one, and accepts the stored value re-sent", async () => {
    const { user, artist } = await createUserWithArtist();
    asUser(user.id);
    const legacy = await prisma.musicTrack.create({
      data: { title: "Legacy", artistId: artist.id, audioUrl: GOOD_AUDIO, coverUrl: "https://legacy-cdn.example/old.jpg", status: "PUBLISHED" },
    });
    // The edit form re-sends the existing cover with a title change: must keep working.
    const same = await patchTrack(jsonReq("https://zrp.one/x", "PATCH", { title: "Renamed", coverUrl: "https://legacy-cdn.example/old.jpg" }), params(legacy.id));
    expect(same.status).toBe(200);
    expect((await same.json()).title).toBe("Renamed");

    const bad = await patchTrack(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: "https://evil.example/new.jpg", coverKey: "VICTIM" }), params(legacy.id));
    expect(bad.status).toBe(400);

    const good = await patchTrack(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: GOOD_COVER, coverKey: "VICTIM_KEY_MUST_BE_IGNORED" }), params(legacy.id));
    expect(good.status).toBe(200);
    const updated = await good.json();
    expect(updated.coverUrl).toBe(GOOD_COVER);
    expect(updated.coverKey).toBe("COVERKEYbbbbbbbbbbbbbbbbbbbb");
  });

  it("DELETE /api/music/tracks/[id] never deletes a storage file another record still references", async () => {
    const { user: victim } = await createUserWithArtist("victim");
    const victimKey = `VICTIMFILE${randomUUID().replace(/-/g, "")}`;
    await prisma.post.create({ data: { authorId: victim.id, content: "my photo", imageUrl: `https://utfs.io/f/${victimKey}` } });

    const { user: attacker, artist } = await createUserWithArtist("attacker");
    // A row created before this hardening could point at the victim's
    // file under a different host form; the key is what matters.
    const track = await prisma.musicTrack.create({
      data: {
        title: "Stolen", artistId: artist.id, status: "PUBLISHED",
        audioUrl: `https://zrp1abc.ufs.sh/f/${victimKey}`, audioKey: victimKey,
        coverUrl: `https://utfs.io/f/ONLYMINE${randomUUID().replace(/-/g, "")}`,
      },
    });
    const ownCoverKey = track.coverUrl!.split("/").pop()!;

    asUser(attacker.id);
    const res = await deleteTrack(new NextRequest("https://zrp.one/x", { method: "DELETE" }), params(track.id));
    expect(res.status).toBe(200);

    const deletedKeys = deleteUploadThingKeys.mock.calls.flatMap((c) => c[0] as string[]);
    expect(deletedKeys).not.toContain(victimKey);
    expect(deletedKeys).toContain(ownCoverKey);
  });

  // ─── Albums ──────────────────────────────────────────────────────
  it("POST/PATCH /api/music/albums enforce trusted covers and server-derived keys", async () => {
    const { user, artist } = await createUserWithArtist();
    asUser(user.id);
    const bad = await createAlbum(jsonReq("https://zrp.one/api/music/albums", "POST", { artistId: artist.id, title: "A", coverUrl: "https://evil.example/c.jpg" }));
    expect(bad.status).toBe(400);
    const good = await createAlbum(jsonReq("https://zrp.one/api/music/albums", "POST", { artistId: artist.id, title: "A", coverUrl: GOOD_COVER, coverKey: "VICTIM" }));
    expect(good.status).toBe(201);
    const album = await good.json();
    expect(album.coverKey).toBe("COVERKEYbbbbbbbbbbbbbbbbbbbb");

    for (const badUrl of BAD_URLS) {
      const r = await patchAlbum(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: badUrl }), params(album.id));
      expect(r.status, badUrl).toBe(400);
    }
    const resend = await patchAlbum(jsonReq("https://zrp.one/x", "PATCH", { title: "B", coverUrl: GOOD_COVER }), params(album.id));
    expect(resend.status).toBe(200);
    const cleared = await patchAlbum(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: null }), params(album.id));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).coverUrl).toBeNull();
  });

  it("DELETE /api/music/albums/[id] keeps artwork that a track still uses", async () => {
    const { user, artist } = await createUserWithArtist();
    const shared = `https://utfs.io/f/SHAREDART${randomUUID().replace(/-/g, "")}`;
    const sharedKey = shared.split("/").pop()!;
    const album = await prisma.musicAlbum.create({ data: { artistId: artist.id, title: "Shared", coverUrl: shared, coverKey: sharedKey } });
    await prisma.musicTrack.create({ data: { title: "T", artistId: artist.id, audioUrl: GOOD_AUDIO, coverUrl: shared, status: "PUBLISHED" } });
    asUser(user.id);
    const res = await deleteAlbum(new Request("https://zrp.one/x", { method: "DELETE" }), params(album.id));
    expect(res.status).toBe(200);
    expect(deleteUploadThingKeys.mock.calls.flatMap((c) => c[0] as string[])).not.toContain(sharedKey);
  });

  // ─── Playlists ───────────────────────────────────────────────────
  it("PATCH /api/music/playlists/[id] only accepts trusted covers (or the stored value)", async () => {
    const { user } = await createUserWithArtist();
    asUser(user.id);
    const playlist = await prisma.musicPlaylist.create({ data: { userId: user.id, name: "P", coverUrl: "https://legacy-cdn.example/p.jpg" } });
    expect((await patchPlaylist(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: "https://evil.example/p.jpg" }), params(playlist.id))).status).toBe(400);
    expect((await patchPlaylist(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: "data:image/png;base64,AA" }), params(playlist.id))).status).toBe(400);
    expect((await patchPlaylist(jsonReq("https://zrp.one/x", "PATCH", { name: "Q", coverUrl: "https://legacy-cdn.example/p.jpg" }), params(playlist.id))).status).toBe(200);
    const ok = await patchPlaylist(jsonReq("https://zrp.one/x", "PATCH", { coverUrl: GOOD_COVER }), params(playlist.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).coverUrl).toBe(GOOD_COVER);
  });

  // ─── Artists ─────────────────────────────────────────────────────
  it("POST /api/music/artists only accepts trusted avatar/banner URLs for NEW values", async () => {
    const { user } = await createUserWithArtist();
    asUser(user.id);
    for (const bad of BAD_URLS) {
      expect((await upsertArtist(jsonReq("https://zrp.one/api/music/artists", "POST", { avatarUrl: bad }))).status, bad).toBe(400);
      expect((await upsertArtist(jsonReq("https://zrp.one/api/music/artists", "POST", { bannerUrl: bad }))).status, bad).toBe(400);
    }
    const ok = await upsertArtist(jsonReq("https://zrp.one/api/music/artists", "POST", { avatarUrl: GOOD_COVER, bannerUrl: "https://zrp1abc.ufs.sh/f/BANNERKEY" }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.avatarUrl).toBe(GOOD_COVER);
    expect(body.bannerUrl).toBe("https://zrp1abc.ufs.sh/f/BANNERKEY");
  });
});
