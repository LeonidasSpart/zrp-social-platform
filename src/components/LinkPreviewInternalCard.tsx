"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Avatar } from "@/components/ui/avatar";
import { getDateLocale } from "@/lib/dateLocale";
import type { InternalLink } from "@/lib/link-preview-internal";

/**
 * The card a ZRP post or profile link unfurls into inside a message or
 * a post body - X's own pattern for a shared post: the card is the
 * post, and tapping it opens the post page where every real action
 * (like, repost, quote, reply, bookmark) already lives. Nothing here
 * duplicates those actions with a fake in-card control.
 *
 * Built from the same live endpoints the post/profile pages read
 * (/api/posts/[id], /api/users/[username]), so it inherits their
 * visibility rules for free: a private-account post, a blocked author
 * or a deleted post 404s and the card simply doesn't render - the
 * plain link text stays, exactly like an external URL with no
 * metadata.
 *
 * Both links are real anchors and never nested: the author row links
 * to the profile, and the post body's <Link> is stretched over the
 * whole card (after:absolute after:inset-0) so the entire surface is
 * the post link while the author row sits above it (relative z-10).
 */

interface PostCardData {
  id: string;
  content: string;
  imageUrl: string | null;
  imageUrls?: string[];
  createdAt: string;
  author: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
    badgeType: string | null;
  };
}

interface ProfileCardData {
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  _count?: { followers?: number; posts?: number };
}

type CardData =
  | { kind: "post"; post: PostCardData }
  | { kind: "profile"; profile: ProfileCardData };

// Module-level cache so the same shared post opened in a long
// conversation (or re-rendered after a socket update) is fetched once
// per page load, not once per bubble render.
const cache = new Map<string, Promise<CardData | null>>();

function load(link: InternalLink): Promise<CardData | null> {
  const key = link.kind === "post" ? `post:${link.id}` : link.kind === "profile" ? `profile:${link.username}` : "";
  if (!key) return Promise.resolve(null);
  const existing = cache.get(key);
  if (existing) return existing;

  const promise: Promise<CardData | null> = (async () => {
    try {
      if (link.kind === "post") {
        const res = await fetch(`/api/posts/${encodeURIComponent(link.id)}`);
        if (!res.ok) return null;
        const post = (await res.json()) as PostCardData;
        if (!post?.id || !post.author?.username) return null;
        return { kind: "post", post };
      }
      if (link.kind === "profile") {
        const res = await fetch(`/api/users/${encodeURIComponent(link.username)}`);
        if (!res.ok) return null;
        const profile = (await res.json()) as ProfileCardData;
        if (!profile?.username) return null;
        return { kind: "profile", profile };
      }
      return null;
    } catch {
      return null;
    }
  })();

  promise.then((value) => {
    // Don't pin a transient failure (offline, 5xx) for the whole page
    // lifetime - the next mount gets to try again.
    if (value === null) cache.delete(key);
  });
  cache.set(key, promise);
  return promise;
}

interface Props {
  link: InternalLink;
  onLoaded?: (found: boolean) => void;
}

export default function LinkPreviewInternalCard({ link, onLoaded }: Props) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);

  const key = link.kind === "post" ? `post:${link.id}` : link.kind === "profile" ? `profile:${link.username}` : "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    load(link).then((value) => {
      if (cancelled) return;
      setData(value);
      setLoading(false);
      onLoaded?.(value !== null);
    });
    return () => {
      cancelled = true;
    };
    // `link` is rebuilt per render by the caller; the cache key is the
    // stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading) {
    return (
      <div
        className="mt-2 flex animate-pulse gap-3 rounded-2xl border border-gray-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-black/20"
        aria-hidden="true"
      >
        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="min-w-0 flex-1 space-y-2 py-1">
          <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const shell =
    "relative mt-2 block overflow-hidden rounded-2xl border border-gray-200 bg-white text-left text-gray-900 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-zrp-charcoal dark:text-white dark:hover:bg-gray-800/70";

  if (data.kind === "profile") {
    const { profile } = data;
    const displayName = profile.name || profile.username;
    return (
      <Link
        href={link.path}
        className={`${shell} flex items-center gap-3 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zrp-deepBlack`}
        aria-label={t("linkPreview.viewProfile", { name: displayName })}
        onClick={(event) => event.stopPropagation()}
      >
        <Avatar src={profile.avatarUrl} name={displayName} alt="" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-tight">
            <span className="min-w-0 truncate">{displayName}</span>
            <VerifiedBadge badgeType={profile.badgeType} className="shrink-0" />
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-700 dark:text-gray-300">{profile.bio}</p>
          )}
        </div>
      </Link>
    );
  }

  const { post } = data;
  const displayName = post.author.name || post.author.username;
  const image = post.imageUrl || post.imageUrls?.[0] || null;
  const dateLabel = (() => {
    const d = new Date(post.createdAt);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString(getDateLocale(language), { month: "short", day: "numeric" });
  })();

  return (
    <div className={`${shell} p-3`} onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={`/profile/${post.author.username}`}
          className="relative z-10 flex min-w-0 items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red"
        >
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full [&>*]:h-6 [&>*]:w-6 [&>*]:text-[10px]">
            <Avatar src={post.author.avatarUrl} name={displayName} alt="" />
          </span>
          <span className="min-w-0 truncate text-sm font-semibold hover:underline">{displayName}</span>
          <VerifiedBadge badgeType={post.author.badgeType} className="shrink-0" />
          <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">@{post.author.username}</span>
        </Link>
        {dateLabel && (
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">· {dateLabel}</span>
        )}
      </div>

      <Link
        href={link.path}
        className="mt-1.5 block after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-zrp-red"
        aria-label={t("linkPreview.viewPost", { name: displayName })}
      >
        {post.content && (
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-5 text-gray-800 dark:text-gray-200">
            {post.content}
          </p>
        )}
        {image && (
          <div className="mt-2 aspect-[1.91/1] w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          </div>
        )}
      </Link>
    </div>
  );
}
