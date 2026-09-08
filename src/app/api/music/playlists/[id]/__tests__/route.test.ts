import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function call(id: string) {
  return GET(new NextRequest(`https://zrp.one/api/music/playlists/${id}`), {
    params: Promise.resolve({ id }),
  });
}

// Regression coverage for L2 (ios-native/PARITY.md): GET
// /api/music/playlists/{id} returned each track with no `liked` state at
// all, unlike every other route that returns music tracks (home, tracks,
// artists/{id}, albums/{id}), which all attach it. A track opened from a
// playlist showed an empty heart even when the viewer had liked it.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/music/playlists/[id] (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const artistIds: string[] = [];
    const trackIds: string[] = [];
    const playlistIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@playlisttest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.musicLike.deleteMany({ where: { trackId: { in: trackIds } } });
      await prisma.musicPlaylist.deleteMany({ where: { id: { in: playlistIds } } });
      await prisma.musicTrack.deleteMany({ where: { id: { in: trackIds } } });
      await prisma.musicArtist.deleteMany({ where: { id: { in: artistIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("attaches liked:true only for tracks the viewer has liked, and liked:false for the rest", async () => {
      const owner = await createUser("owner");
      const artistUser = await createUser("artist");
      const artist = await prisma.musicArtist.create({
        data: { id: randomUUID(), userId: artistUser.id, displayName: "Test Artist" },
      });
      artistIds.push(artist.id);

      const likedTrack = await prisma.musicTrack.create({
        data: { id: randomUUID(), artistId: artist.id, title: "Liked Track", audioUrl: "https://example.com/a.mp3" },
      });
      trackIds.push(likedTrack.id);
      const unlikedTrack = await prisma.musicTrack.create({
        data: { id: randomUUID(), artistId: artist.id, title: "Unliked Track", audioUrl: "https://example.com/b.mp3" },
      });
      trackIds.push(unlikedTrack.id);

      const playlist = await prisma.musicPlaylist.create({
        data: {
          id: randomUUID(),
          userId: owner.id,
          name: "Test Playlist",
          isPublic: true,
          tracks: {
            create: [
              { trackId: likedTrack.id, position: 0 },
              { trackId: unlikedTrack.id, position: 1 },
            ],
          },
        },
      });
      playlistIds.push(playlist.id);

      await prisma.musicLike.create({
        data: { id: randomUUID(), userId: owner.id, trackId: likedTrack.id },
      });

      getServerSession.mockResolvedValue(sessionFor(owner.id));
      const res = await call(playlist.id);
      expect(res.status).toBe(200);
      const body = await res.json();

      const liked = body.tracks.find((pt: { track: { id: string } }) => pt.track.id === likedTrack.id);
      const unliked = body.tracks.find((pt: { track: { id: string } }) => pt.track.id === unlikedTrack.id);
      expect(liked.track.liked).toBe(true);
      expect(unliked.track.liked).toBe(false);
    });

    it("reports liked:false for every track when there is no signed-in viewer", async () => {
      const owner = await createUser("anonowner");
      const artistUser = await createUser("anonartist");
      const artist = await prisma.musicArtist.create({
        data: { id: randomUUID(), userId: artistUser.id, displayName: "Anon Artist" },
      });
      artistIds.push(artist.id);

      const track = await prisma.musicTrack.create({
        data: { id: randomUUID(), artistId: artist.id, title: "Track", audioUrl: "https://example.com/c.mp3" },
      });
      trackIds.push(track.id);

      const playlist = await prisma.musicPlaylist.create({
        data: {
          id: randomUUID(),
          userId: owner.id,
          name: "Public Playlist",
          isPublic: true,
          tracks: { create: [{ trackId: track.id, position: 0 }] },
        },
      });
      playlistIds.push(playlist.id);

      getServerSession.mockResolvedValue(null);
      const res = await call(playlist.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tracks[0].track.liked).toBe(false);
      expect(body.isOwner).toBe(false);
    });
  }
);
