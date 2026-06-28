"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { TipBox } from "@/components/tip/tip-box";
import type { UndiscoveredPost, UndiscoveredResult } from "@/lib/undiscovered";

// 「出会いを待つ記事」: まだ投げ銭の無い記事をランダム表示し、「最初の灯りを灯す」行動を促す。
// 記事リストの構造はプロフィールの「最近投げ銭した記事」を踏襲（divide-y のリスト）。
// 「もっと見る」で表示済みを除外した追加分を取得して追記する。

export function TodaysEncounters({
  initial,
  currentUserId,
}: {
  initial: UndiscoveredResult;
  currentUserId: string | null;
}) {
  const [posts, setPosts] = useState<UndiscoveredPost[]>(initial.posts);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  // お祝い・空状態の判定は初期取得（グローバル基準）の値を使う。
  const allDiscovered = initial.allDiscovered;

  // 投げ銭をもらえてない記事が無い場合（全て投げ銭済み／紹介できる記事なし）は
  // セクションごと非表示にする。
  if (allDiscovered || posts.length === 0) {
    return null;
  }

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const exclude = posts.map((p) => p.id).join(",");
      const res = await fetch(
        `/api/posts/undiscovered?limit=5&exclude=${encodeURIComponent(exclude)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const next = (await res.json()) as UndiscoveredResult;
        // 念のためクライアント側でも重複を排除して追記する。
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...next.posts.filter((p) => !seen.has(p.id))];
        });
        setHasMore(next.hasMore);
      }
    } catch {
      // ネットワークエラー時は現在の表示を維持する。
    } finally {
      setLoading(false);
    }
  }, [posts]);

  return (
    <section className="mb-8 rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/20">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-rose-600 dark:text-rose-300">
          🕯 投げ銭をもらえてない記事
        </h2>
        <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
          最初のありがとうを届けよう
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-wrap items-center gap-2">
            <Link
              href={`/posts/${post.id}`}
              className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline"
            >
              <span aria-hidden="true" className="shrink-0 text-sm">
                🕯
              </span>
              <span className="truncate text-sm font-medium">{post.title}</span>
            </Link>
            {/* 自分の記事には応援ボタンを出さない（自分宛に投げ銭できないため）。 */}
            {currentUserId !== post.author.id && (
              <TipBox
                postId={post.id}
                recipientAddress={post.author.xymAddress}
                isAuthor={false}
                compact
                triggerLabel="応援する"
              />
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="text-xs font-medium text-rose-600 underline-offset-2 transition hover:underline disabled:opacity-50 dark:text-rose-300"
          >
            {loading ? "読み込み中…" : "もっと見る"}
          </button>
        </div>
      )}
    </section>
  );
}
