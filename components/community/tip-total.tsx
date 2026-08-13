"use client";

import { useEffect, useRef, useState } from "react";

// 投げ銭合計バッジ。金額が増えたときは数字をカウントアップ・アニメーションする。
export function TipTotal({
  total,
  count,
}: {
  total: number;
  count: number;
}) {
  const [display, setDisplay] = useState(total);
  const fromRef = useRef(total);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = total;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const DURATION = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [total]);

  if (total <= 0) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums dark:bg-amber-950 dark:text-amber-200">
      💰 {display.toFixed(1)} XYM
      {count > 0 && <span className="text-amber-500">・{count}人</span>}
    </span>
  );
}
