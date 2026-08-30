"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// トピック一覧のライブトーク人数を最新に保つ。
// バッジ自体はサーバーコンポーネントが描画しているので、ここでは軽量APIを監視し
// 「人数が変わったときだけ」再取得させる（無駄な再描画をしない）。
// 表示中・フォーカス時のみ動作する点はチャットの差分ポーリングと同じ方針。
const POLL_MS = 30_000;

// キー順に依存しない安定した比較用文字列。
function stableKey(counts: Record<string, number>): string {
  return Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(",");
}

export function LiveTalkRefresher({
  initialCounts,
}: {
  initialCounts: Record<string, number>;
}) {
  const router = useRouter();
  const shown = useRef(stableKey(initialCounts));

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/community/voice-status");
        if (!res.ok) return;
        const data = (await res.json()) as { counts?: Record<string, number> };
        if (stopped || !data.counts) return;
        const next = stableKey(data.counts);
        if (next !== shown.current) {
          shown.current = next;
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  return null;
}
