import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET as listBookmarks } from "../route";
import { POST as bookmarkPost } from "../../posts/[id]/bookmark/route";
import { POST as bookmarkComment } from "../../comments/[id]/bookmark/route";
import { POST as repostPost } from "../../posts/[id]/repost/route";
import { POST as createComment } from "../../posts/[id]/comments/route";
import { GET as listQuotes } from "../../posts/[id]/quotes/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(url: string, body?: unknown) {
  return new NextRequest(`https://zrp.one${url}`, {
    method: body === undefined ? "POST" : "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/*
 * ⚠️ SECURITY regression coverage: the interaction routes only checked
 * that a post id existed, while the places they surface the post
 * (GET /api/bookmarks, a reposter's reposts tab) never re-check the
 * read rules - so a private/scheduled post was readable by bookmarking
 * it, and a premium post's full text was readable by bookmarking any
 * comment on it (a comment bookmark carries its parent post's content).
 */
describe.skipIf(!hasRealDatabaseUrl)("interaction routes - post visibility (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  beforeEach(() => getServerSession.mockReset());

  afterAll(async () => {
    await prisma.commentBookmark.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.bookmark.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.repost.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.repostDailyUsage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { fromUserId: { in: userIds } }] } });
    await prisma.premiumPost.deleteMany({ where: { post: { authorId: { in: userIds } } } });
    await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.blocked.deleteMany({ where: { blockerId: { in: userIds } } });
    await prisma.follow.deleteMany({ where: { followerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string, data: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@interactionvis.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        ...data,
      },
    });
    userIds.push(user.id);
    return user;
  }

  const as = (id: string) => getServerSession.mockResolvedValue({ user: { id, plan: "free" } });

  it("refuses to bookmark, repost or comment on a private account's post for a non-follower", async () => {
    const owner = await createUser("ivowner", { isPrivate: true });
    const stranger = await createUser("ivstranger");
    const post = await prisma.post.create({ data: { authorId: owner.id, content: "private", status: "published" } });

    as(stranger.id);
    expect((await bookmarkPost(req(`/api/posts/${post.id}/bookmark`), params(post.id))).status).toBe(404);
    expect((await repostPost(req(`/api/posts/${post.id}/repost`), params(post.id))).status).toBe(404);
    expect((await createComment(req(`/api/posts/${post.id}/comments`, { content: "hi" }), params(post.id))).status).toBe(404);

    expect(await prisma.bookmark.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma.repost.count({ where: { postId: post.id } })).toBe(0);
    expect(await prisma.comment.count({ where: { postId: post.id } })).toBe(0);
  });

  it("refuses to bookmark a scheduled (unpublished) post for anyone but its author", async () => {
    const author = await createUser("ivsched");
    const other = await createUser("ivother");
    const post = await prisma.post.create({
      data: { authorId: author.id, content: "tomorrow", status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000) },
    });

    as(other.id);
    expect((await bookmarkPost(req(`/api/posts/${post.id}/bookmark`), params(post.id))).status).toBe(404);
    as(author.id);
    expect((await bookmarkPost(req(`/api/posts/${post.id}/bookmark`), params(post.id))).status).toBe(200);
  });

  it("does not let an approved follower repost a private account's post", async () => {
    const owner = await createUser("ivprivrp", { isPrivate: true });
    const follower = await createUser("ivfollower");
    await prisma.follow.create({ data: { followerId: follower.id, followingId: owner.id } });
    const post = await prisma.post.create({ data: { authorId: owner.id, content: "followers only", status: "published" } });

    as(follower.id);
    expect((await repostPost(req(`/api/posts/${post.id}/repost`), params(post.id))).status).toBe(403);
    expect(await prisma.repost.count({ where: { postId: post.id } })).toBe(0);
  });

  it("redacts a premium post's content carried by a bookmarked comment", async () => {
    const creator = await createUser("ivcreator");
    const viewer = await createUser("ivviewer");
    const post = await prisma.post.create({ data: { authorId: creator.id, content: "SECRET PAID TEXT", status: "published" } });
    const profile = await prisma.creatorProfile.create({ data: { userId: creator.id, premiumPostsEnabled: true } });
    await prisma.premiumPost.create({ data: { postId: post.id, creatorProfileId: profile.id, price: 4, previewContent: "preview" } });
    const comment = await prisma.comment.create({ data: { postId: post.id, authorId: creator.id, content: "a comment" } });

    as(viewer.id);
    expect((await bookmarkComment(req(`/api/comments/${comment.id}/bookmark`), params(comment.id))).status).toBe(200);

    as(viewer.id);
    const body = await (await listBookmarks(new NextRequest("https://zrp.one/api/bookmarks"))).json();
    const item = body.items.find((i: { type: string; id: string }) => i.type === "comment");
    expect(item.comment.post.content).toBe("preview");
    expect(JSON.stringify(body)).not.toContain("SECRET PAID TEXT");
  });

  it("answers an unknown comment id with 404 and a concurrent double bookmark with 200s, not 500s", async () => {
    const user = await createUser("ivdouble");
    const author = await createUser("ivauthor");
    const post = await prisma.post.create({ data: { authorId: author.id, content: "public", status: "published" } });
    const comment = await prisma.comment.create({ data: { postId: post.id, authorId: author.id, content: "c" } });

    as(user.id);
    expect((await bookmarkComment(req(`/api/comments/nope/bookmark`), params("nope"))).status).toBe(404);

    const [a, b] = await Promise.all([
      bookmarkComment(req(`/api/comments/${comment.id}/bookmark`), params(comment.id)),
      bookmarkComment(req(`/api/comments/${comment.id}/bookmark`), params(comment.id)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const [c, d] = await Promise.all([
      bookmarkPost(req(`/api/posts/${post.id}/bookmark`), params(post.id)),
      bookmarkPost(req(`/api/posts/${post.id}/bookmark`), params(post.id)),
    ]);
    expect([c.status, d.status]).toEqual([200, 200]);
  });

  it("hides quotes by private, scheduled and blocked authors from the quotes listing", async () => {
    const author = await createUser("ivqorig");
    const viewer = await createUser("ivqviewer");
    const privateQuoter = await createUser("ivqpriv", { isPrivate: true });
    const blockedQuoter = await createUser("ivqblock");
    const publicQuoter = await createUser("ivqpub");
    const original = await prisma.post.create({ data: { authorId: author.id, content: "orig", status: "published" } });
    await prisma.blocked.create({ data: { blockerId: viewer.id, blockedId: blockedQuoter.id } });

    const mk = (authorId: string, extra: Record<string, unknown> = {}) =>
      prisma.post.create({ data: { authorId, content: "q", quotePostId: original.id, status: "published", ...extra } });
    const hiddenIds = [
      (await mk(privateQuoter.id)).id,
      (await mk(blockedQuoter.id)).id,
      (await mk(publicQuoter.id, { status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000) })).id,
    ];
    const visible = await mk(publicQuoter.id);

    as(viewer.id);
    const body = await (await listQuotes(new NextRequest(`https://zrp.one/api/posts/${original.id}/quotes`), params(original.id))).json();
    const ids = body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(visible.id);
    for (const id of hiddenIds) expect(ids).not.toContain(id);
  });
});
