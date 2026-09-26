import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSessionAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";

async function findCommunity(idOrSlug: string) {
  return prisma.community.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      hashtag: true,
      iconUrl: true,
      memberCount: true,
      createdAt: true,
      createdBy: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  try {
    const community = await findCommunity(id);
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const membership = userId
      ? await prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: community.id, userId } },
          select: { role: true },
        })
      : null;

    // Whether THIS viewer may delete the community - the same rule the
    // DELETE handler below enforces (OWNER role, creator, or site
    // admin), so clients show the Delete control off a real server
    // answer instead of guessing from createdBy alone.
    const isOwner = membership?.role === "OWNER" || (!!userId && community.createdBy.id === userId);
    const canDelete = isOwner || (!!session && (await isSessionAdmin(session)));

    return NextResponse.json({
      community,
      isMember: !!membership,
      myRole: membership?.role ?? null,
      canDelete,
    });
  } catch (error) {
    console.error("Error fetching community:", error);
    return NextResponse.json({ error: "Failed to fetch community" }, { status: 500 });
  }
}

// Only the community's OWNER (the creator holds that role from
// creation and can never leave - see the leave route), or a site
// admin, may delete it. Deleting cascades to every CommunityMember
// row (see the schema's own onDelete: Cascade on that relation) - a
// community's feed is hashtag-derived, not a separate content table,
// so no posts are deleted by this: the hashtag simply stops being a
// browsable community. Anyone else - a MEMBER, an ADMIN-role member,
// a non-member - gets 403.
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: {
        id: true,
        name: true,
        createdById: true,
        members: { where: { userId: session.user.id }, select: { role: true } },
      },
    });
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    // The real membership row's role is the authority (it is what every
    // client shows the Delete control off); createdById is kept as a
    // belt-and-braces equivalent for rows created before the
    // owner-cannot-leave rule existed.
    const isOwner =
      community.members[0]?.role === "OWNER" || community.createdById === session.user.id;
    const isAdmin = !isOwner && (await isSessionAdmin(session));
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.community.delete({ where: { id: community.id } });

    if (isAdmin) {
      await logAdminAction({
        actor: session,
        action: "community.delete",
        targetType: "Community",
        targetId: community.id,
        metadata: { name: community.name, createdById: community.createdById },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting community:", error);
    return NextResponse.json({ error: "Failed to delete community" }, { status: 500 });
  }
}
