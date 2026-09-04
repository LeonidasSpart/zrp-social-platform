import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Account deletion is the same UploadThing-orphan gap as individual
    // post/message/comment deletion, just at full-account scale - every
    // post, message, comment, story, Music track/album/artist profile,
    // playlist, Marketplace listing, Help campaign, and Opportunity
    // application this user ever had cascades away in the database
    // (onDelete: Cascade throughout), but none of that ever reaches
    // UploadThing on its own. Collecting every file this user actually
    // owns - and, for messages, every file the cascade is *also* about
    // to remove regardless of who sent it (received-message images ride
    // the same onDelete: Cascade on Message.receiver) - before the
    // cascade wipes the rows that reference them.
    const [
      posts,
      comments,
      sentMessages,
      receivedMessages,
      stories,
      musicTracks,
      musicAlbums,
      musicArtist,
      musicPlaylists,
      listings,
      helpCampaigns,
      opportunityApplications,
    ] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id },
        select: { imageUrl: true, imageUrls: true },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.message.findMany({
        where: { senderId: user.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.message.findMany({
        where: { receiverId: user.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.story.findMany({
        where: { userId: user.id, mediaUrl: { not: null } },
        select: { mediaUrl: true },
      }),
      prisma.musicTrack.findMany({
        where: { artist: { userId: user.id } },
        select: { audioUrl: true, coverUrl: true },
      }),
      prisma.musicAlbum.findMany({
        where: { artist: { userId: user.id }, coverUrl: { not: null } },
        select: { coverUrl: true },
      }),
      prisma.musicArtist.findUnique({
        where: { userId: user.id },
        select: { avatarUrl: true, bannerUrl: true },
      }),
      prisma.musicPlaylist.findMany({
        where: { userId: user.id, coverUrl: { not: null } },
        select: { coverUrl: true },
      }),
      prisma.listing.findMany({
        where: { sellerId: user.id },
        select: { imageUrls: true, videoUrl: true },
      }),
      prisma.helpCampaign.findMany({
        where: { organizerId: user.id },
        select: { imageUrls: true, proofUrls: true },
      }),
      prisma.opportunityApplication.findMany({
        where: { applicantId: user.id, resumeUrl: { not: null } },
        select: { resumeUrl: true },
      }),
    ]);

    await prisma.user.delete({
      where: { id: session.user.id },
    });

    await deleteUploadThingFiles([
      user.avatarUrl,
      user.coverUrl,
      ...posts.flatMap((p) => [p.imageUrl, ...p.imageUrls]),
      ...comments.map((c) => c.imageUrl),
      ...sentMessages.map((m) => m.imageUrl),
      ...receivedMessages.map((m) => m.imageUrl),
      ...stories.map((s) => s.mediaUrl),
      ...musicTracks.flatMap((t) => [t.audioUrl, t.coverUrl]),
      ...musicAlbums.map((a) => a.coverUrl),
      musicArtist?.avatarUrl,
      musicArtist?.bannerUrl,
      ...musicPlaylists.map((p) => p.coverUrl),
      ...listings.flatMap((l) => [...l.imageUrls, l.videoUrl]),
      ...helpCampaigns.flatMap((c) => [...c.imageUrls, ...c.proofUrls]),
      ...opportunityApplications.map((a) => a.resumeUrl),
    ]);

    const response = NextResponse.json({ success: true });
    // Clear both possible cookie names (http and https/production variants)
    response.cookies.set("next-auth.session-token", "", { maxAge: 0, path: "/" });
    response.cookies.set("__Secure-next-auth.session-token", "", { maxAge: 0, path: "/", secure: true });

    return response;
  } catch (error) {
    console.error("Confirm deletion error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
