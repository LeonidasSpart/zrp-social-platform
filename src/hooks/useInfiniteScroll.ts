"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ItemWithId {
  id: string;
}

interface UseInfiniteScrollOptions {
  initialPage?: number;
  limit?: number;
  enabled?: boolean;
}

export function useInfiniteScroll<T extends ItemWithId>({
  initialPage = 1,
  limit = 10,
  enabled = true,
}: UseInfiniteScrollOptions = {}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(initialPage);
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMore = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current || (!hasMore && !reset)) return;

      isLoadingRef.current = true;
      setLoading(true);
      setError(null);

      if (reset) {
        setItems([]);
        setHasMore(true);
        setPage(initialPage);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // ─── Get the last item's ID as cursor ──────────────────────
        const lastItem = !reset && items.length > 0 ? items[items.length - 1] : null;
        const cursor = lastItem?.id || undefined;

        const url = new URL("/api/posts", window.location.origin);
        url.searchParams.set("limit", String(limit));
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();

        if (reset) {
          setItems(data.posts || []);
        } else {
          setItems((prev) => [...prev, ...(data.posts || [])]);
        }

        setHasMore(!!data.nextCursor);
        setPage((p) => (reset ? initialPage : p + 1));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err as Error);
        }
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [items, hasMore, limit, initialPage]
  );

  const reset = useCallback(() => {
    fetchMore(true);
  }, [fetchMore]);

  useEffect(() => {
    if (enabled) {
      fetchMore(true);
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled]);

  return {
    items,
    loading,
    hasMore,
    error,
    fetchMore,
    reset,
    setItems,
  };
}
