"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PostCard, type PostCardData } from "@/components/post-card";

export type FeedItem = PostCardData & { tip: { total: number; count: number } };

// スクロールで自動的に次ページを読み込む記事一覧（Twitter 風）。
// 初期ページはサーバーから props で受け取り、以降は /api/posts/list を取得して追記する。
export function PostFeed({
  initialPosts,
  initialHasMore,
  q,
  tag,
}: {
  initialPosts: FeedItem[];
  initialHasMore: boolean;
  q: string;
  tag: string;
}) {
  const [posts, setPosts] = useState<FeedItem[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(false);
    try {
      const next = page + 1;
      const sp = new URLSearchParams({ page: String(next) });
      if (q) sp.set("q", q);
      if (tag) sp.set("tag", tag);
      const res = await fetch(`/api/posts/list?${sp.toString()}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { posts: FeedItem[]; hasMore: boolean };
      setPosts((prev) => [...prev, ...data.posts]);
      setHasMore(data.hasMore);
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, q, tag]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} tip={p.tip} />
        ))}
      </ul>

      {hasMore && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}

      {loading && (
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          読み込み中...
        </p>
      )}

      {error && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
          >
            読み込みに失敗しました。再試行
          </button>
        </div>
      )}
    </>
  );
}
