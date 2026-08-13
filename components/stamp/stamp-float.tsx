"use client";

import { useEffect, useRef, useState } from "react";
import type { PostStampPlacement } from "@/lib/stamps";

// 控えめな演出パラメータ。
const SPAWN_INTERVAL_MS = 2600;

type Floater = { id: number; src: string; left: number; size: number; duration: number };

// 記事に貼られたスタンプを、画面下からゆらゆら上昇させてフェードアウトする演出。
// pointer-events:none で操作を邪魔せず、タブ可視時のみ・reduced-motion では無効。
// 左下の小さなトグルでオン/オフ切替（localStorage 保存）。
export function StampFloat({ placements }: { placements: PostStampPlacement[] }) {
  const [enabled, setEnabled] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const idRef = useRef(0);
  const poolRef = useRef<string[]>([]);

  // 貼付数で重み付けした画像プールを作る（多く貼られたスタンプほど出やすい）。
  useEffect(() => {
    const pool: string[] = [];
    for (const p of placements) {
      const weight = Math.min(p.count, 10);
      for (let i = 0; i < weight; i++) pool.push(p.imageUrl);
    }
    poolRef.current = pool;
  }, [placements]);

  // 設定の復元と reduced-motion 判定。
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (window.localStorage.getItem("nagexym.stampfloat") === "off") setEnabled(false);
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) setReduced(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!enabled || reduced || placements.length === 0) return;
    // 実際に貼られた数だけ一度ずつ流し、出し切ったら止まる（消えても再出現しない）。
    const queue = [...poolRef.current];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    const runner: { timer: number | null } = { timer: null };
    const spawn = () => {
      // タブが非表示の間はキューを消費しない（戻ったら続きから）。
      if (document.visibilityState !== "visible") return;
      const src = queue.shift();
      if (src === undefined) {
        if (runner.timer) window.clearInterval(runner.timer);
        return;
      }
      const id = idRef.current++;
      const left = 4 + Math.random() * 88; // 画面幅%（端に寄りすぎない）
      const size = 56 + Math.floor(Math.random() * 40); // 56〜96px
      const duration = 4500 + Math.floor(Math.random() * 2000); // 4.5〜6.5秒
      setFloaters((prev) => [...prev, { id, src, left, size, duration }]);
      window.setTimeout(() => {
        setFloaters((f) => f.filter((x) => x.id !== id));
      }, duration);
    };
    runner.timer = window.setInterval(spawn, SPAWN_INTERVAL_MS);
    return () => {
      if (runner.timer) window.clearInterval(runner.timer);
    };
  }, [enabled, reduced, placements.length]);

  function toggle() {
    setEnabled((v) => {
      const next = !v;
      window.localStorage.setItem("nagexym.stampfloat", next ? "on" : "off");
      if (!next) setFloaters([]);
      return next;
    });
  }

  if (placements.length === 0 || reduced) return null;

  return (
    <>
      {enabled && (
        <div
          className="pointer-events-none fixed inset-0 z-20 overflow-hidden"
          aria-hidden="true"
        >
          {floaters.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.id}
              src={f.src}
              alt=""
              style={{
                left: `${f.left}%`,
                width: f.size,
                height: f.size,
                animationDuration: `${f.duration}ms`,
              }}
              className="stamp-float absolute bottom-0 object-contain"
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        title={enabled ? "スタンプ演出をオフにする" : "スタンプ演出をオンにする"}
        className="fixed bottom-3 left-3 z-30 rounded-full border border-gray-300 bg-white/80 px-2 py-1 text-xs text-gray-600 shadow-sm backdrop-blur transition hover:bg-white dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300"
      >
        🎈{enabled ? "" : " off"}
      </button>
    </>
  );
}
