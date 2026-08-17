"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";

interface AdCardProps {
  ad: {
    campaignId: string;
    targetUrl: string | null;
    post: {
      id: string;
      content: string;
      imageUrl?: string | null;
      imageUrls?: string[];
      mediaType?: string | null;
      author: {
        id: string;
        username: string;
        name: string;
        avatarUrl?: string | null;
      };
    };
  };
}

// A deliberately simple, self-contained card - reuses none of PostCard's
// engagement machinery (like/comment/repost) on purpose, since an ad
// isn't a normal timeline post. Impression tracking mirrors the same
// IntersectionObserver + sessionStorage-dedupe pattern PostCard already
// uses for view counting, just against the ad-specific endpoints.
export default function AdCard({ ad }: AdCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [impressionLogged, setImpressionLogged] = useState(false);

  useEffect(() => {
    if (!containerRef.current || impressionLogged) return;
    const el = containerRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionLogged) {
          setImpressionLogged(true);
          fetch("/api/ads/impression", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId: ad.campaignId }),
          }).catch(() => {});
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ad.campaignId, impressionLogged]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/ads/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: ad.campaignId }),
      });
      const data = await res.json();
      const url = data.redirectUrl || `/post/${ad.post.id}`;
      if (url.startsWith("http")) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = url;
      }
    } catch {
      window.location.href = `/post/${ad.post.id}`;
    }
  };

  const image = ad.post.imageUrls?.[0] || ad.post.imageUrl;

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-zrp-deepBlack px-4 py-3 border-b border-gray-200 dark:border-gray-800"
    >
      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
        <Megaphone className="w-3.5 h-3.5" />
        <span>Sponsored</span>
      </div>
      <a href="#" onClick={handleClick} className="block cursor-pointer">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold flex-shrink-0 overflow-hidden">
            {ad.post.author.avatarUrl ? (
              <img src={ad.post.author.avatarUrl} alt={ad.post.author.name} className="w-full h-full object-cover" />
            ) : (
              (ad.post.author.name || ad.post.author.username)[0]?.toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white">
              {ad.post.author.name || ad.post.author.username}
            </p>
            <p className="text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">
              {ad.post.content}
            </p>
            {image && (
              <div className="mt-2 rounded-2xl overflow-hidden">
                <img src={image} alt="" className="w-full" />
              </div>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}
