"use client";

import { useEffect, useState } from "react";
import { formatXym } from "@/lib/format";
import type { TipRateStats } from "@/lib/tip-rate";

// 投げ銭率インジケーター（トップ最上部のヒーローバナー）。
// 「すべての記事に投げ銭される港」を目標に、Harbor 全体の投げ銭率を 100% に近づける参加型表示。

// 率（0..100）から赤→黄→緑のグラデ色を返す（0%=赤 / 50%=黄 / 100%=緑）。
function rateColor(r: number): string {
  const hue = Math.max(0, Math.min(120, (r / 100) * 120));
  return `hsl(${hue} 75% 42%)`;
}

const num = (n: number) => n.toLocaleString("ja-JP");
const pct = (n: number) => `${n.toFixed(1)}%`;
const ymd = (s: string | null) => (s ? s.replace(/-/g, "/") : "—");

export function TipRateIndicator({ stats }: { stats: TipRateStats }) {
  // マウント後に 0 → 実値へ動かして控えめにアニメーションさせる。
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const rate = stats.rate;
  const display = shown ? rate : 0;

  // 投げ銭率が 100% に到達したら「港が満ちた」お祝い演出を出す。
  const achieved = rate >= 100;

  // 円形ゲージ（SVG）。
  const R = 60;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - display / 100);
  const color = rateColor(rate);

  function scrollToArticles() {
    document
      .getElementById("latest-articles")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className={`relative isolate mb-8 overflow-hidden rounded-2xl border bg-cyan-50 bg-cover bg-center p-5 shadow-sm sm:p-6 dark:bg-cyan-950/30 ${
        achieved
          ? "border-amber-300/80 shadow-amber-200/50 ring-2 ring-amber-300/60 dark:border-amber-500/50 dark:ring-amber-500/30 motion-safe:animate-[tiprate-celebrate-glow_2.4s_ease-in-out_infinite]"
          : "border-cyan-200/70 dark:border-cyan-900/50"
      }`}
      style={{ backgroundImage: "url(/background.png)" }}
    >
      {/* 写真の上でも文字が読めるように薄いオーバーレイを重ねる。 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-white/55 dark:bg-black/45"
      />

      {/* 100%達成時のお祝い演出（紙吹雪＋金色グロー）。装飾なので reduced-motion では出さない。 */}
      {achieved && <Celebration />}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* 左: 円形ゲージ */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="relative h-36 w-36 rounded-full bg-white/85 shadow-md ring-1 ring-white/70 backdrop-blur-sm dark:bg-gray-900/75 dark:ring-white/10">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
              <circle
                cx="70"
                cy="70"
                r={R}
                fill="none"
                strokeWidth="12"
                className="stroke-cyan-200/80 dark:stroke-cyan-800/60"
              />
              <circle
                cx="70"
                cy="70"
                r={R}
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                stroke={color}
                strokeDasharray={C}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-3xl font-extrabold tabular-nums"
                style={{ color }}
              >
                {pct(rate)}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                投げ銭率
              </span>
            </div>
            {/* 達成時はゲージの周りにスパークルを散らす。 */}
            {achieved && (
              <>
                <span className="absolute -right-1 -top-1 text-xl motion-safe:animate-[tiprate-sparkle_1.6s_ease-in-out_infinite]">
                  ✨
                </span>
                <span className="absolute -bottom-1 -left-1 text-lg motion-safe:animate-[tiprate-sparkle_1.6s_ease-in-out_infinite_0.8s]">
                  ✨
                </span>
              </>
            )}
          </div>
          {achieved ? (
            <p className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 text-xs font-extrabold text-amber-950 shadow-sm motion-safe:animate-[tiprate-badge-pop_1.8s_ease-in-out_infinite]">
              🎉 100%達成！港が満ちました 🎉
            </p>
          ) : (
            <p className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm backdrop-blur-sm dark:bg-gray-900/70 dark:text-teal-200">
              みんなで100%を目指そう！
            </p>
          )}
        </div>

        {/* 右: キャッチコピー + 4 統計カード */}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-cyan-900 sm:text-xl dark:text-cyan-100">
            みんなの「ありがとう」で、港を満たそう。
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            投げ銭が行われた記事の割合（統計）
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat emoji="❤️" label="累計記事数" value={num(stats.totalPosts)} />
            <MiniStat emoji="👥" label="投げ銭あり記事数" value={num(stats.tippedPosts)} />
            <MiniStat emoji="👥" label="投げ銭ユーザー数" value={num(stats.tipperUsers)} />
            <MiniStat
              emoji="💠"
              label="累計流通額"
              value={formatXym(stats.totalXym)}
              unit="XYM"
            />
          </div>
        </div>
      </div>

      {/* 横長プログレスバー（赤→黄→緑のスケール＋現在位置バブル） */}
      <div className="mt-6">
        <div className="relative pt-7">
          {/* 現在位置バブル */}
          <div
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${display}%`, transition: "left 1s ease-out" }}
          >
            <span
              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
              style={{ backgroundColor: color }}
            >
              現在 {pct(rate)}
            </span>
            <span
              className="mx-auto block h-2 w-px"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          </div>
          <div
            className="h-3 w-full rounded-full"
            style={{
              background:
                "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)",
            }}
            role="progressbar"
            aria-valuenow={Math.round(rate)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="投げ銭率"
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-400">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span className={achieved ? "font-bold text-amber-500" : undefined}>
            100% {achieved ? "🎊" : "🚩"}
          </span>
        </div>
      </div>

      {/* みんなの港の統計 */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <PortStat
          emoji="📅"
          label="平均投げ銭率（30日）"
          value={pct(stats.avgRate30d)}
        />
        <PortStat
          emoji="📈"
          label="最高記録"
          value={pct(stats.maxRate)}
          sub={ymd(stats.maxRateDate)}
        />
        <PortStat emoji="⭐" label="100%達成日数" value={`${num(stats.days100)}日`} />
        <PortStat
          emoji="🎁"
          label="投げ銭が最も多かった日"
          value={stats.topTipDay ? `${formatXym(stats.topTipDay.xym)} XYM` : "—"}
          sub={stats.topTipDay ? ymd(stats.topTipDay.date) : undefined}
        />
        <PortStat
          emoji="💬"
          label="リアクション総数"
          value={num(stats.reactionsTotal)}
        />
      </div>

      {/* フッター行 */}
      <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-cyan-200/60 pt-4 sm:flex-row sm:items-center dark:border-cyan-900/40">
        <p className="flex items-center gap-1 rounded-full bg-white/75 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm dark:bg-gray-900/70 dark:text-gray-200">
          小さな感謝が、大きな波になります。
          <span aria-hidden="true" className="tracking-tighter">
            🩵🩵🩵
          </span>
        </p>
        <button
          type="button"
          onClick={scrollToArticles}
          className="shrink-0 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          今日もありがとうを届けよう →
        </button>
      </div>
    </section>
  );
}

// 100%達成時のお祝い演出。外部ライブラリを使わず CSS だけで紙吹雪を降らせる。
// 演出用キーフレームもここでまとめて定義する（インジケーター全体が参照）。
const CONFETTI_COLORS = ["#fbbf24", "#22c55e", "#06b6d4", "#f472b6", "#a78bfa", "#ef4444"];

function Celebration() {
  // マウント時に一度だけ並びを決め、再レンダーで揺れないよう固定する。
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: (i * 97) % 100, // 擬似ランダムに横位置を散らす
      delay: ((i * 53) % 30) / 10, // 0〜3s
      duration: 2.6 + (((i * 31) % 18) / 10), // 2.6〜4.4s
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + ((i * 7) % 5), // 6〜10px
      round: i % 3 === 0,
    })),
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden motion-reduce:hidden"
    >
      <style>{`
        @keyframes tiprate-confetti-fall {
          0% { transform: translateY(-12%) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(120%) rotate(540deg); opacity: 0.9; }
        }
        @keyframes tiprate-celebrate-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
          50% { box-shadow: 0 0 24px 4px rgba(251, 191, 36, 0.45); }
        }
        @keyframes tiprate-sparkle {
          0%, 100% { transform: scale(0.85) rotate(-8deg); opacity: 0.55; }
          50% { transform: scale(1.25) rotate(8deg); opacity: 1; }
        }
        @keyframes tiprate-badge-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "2px",
            animation: `tiprate-confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function MiniStat({
  emoji,
  label,
  value,
  unit,
}: {
  emoji: string;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-white/60 bg-white/70 p-2 text-center dark:border-white/5 dark:bg-white/5">
      <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
        {emoji} {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-gray-400">{unit}</span>}
      </p>
    </div>
  );
}

function PortStat({
  emoji,
  label,
  value,
  sub,
}: {
  emoji: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-white/60 bg-white/60 p-2.5 dark:border-white/5 dark:bg-white/5">
      <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
        {emoji} {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {value}
      </p>
      {sub && (
        <p className="truncate text-[10px] text-gray-400">{sub}</p>
      )}
    </div>
  );
}
