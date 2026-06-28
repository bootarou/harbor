import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { jstDateString } from "@/lib/date";

// トップの「投げ銭率インジケーター」用の集計。すべて Prisma 集計（生SQL不使用）。
// 「すべての記事に投げ銭される港」を目標に、Harbor 全体の投げ銭率を表示する。

export type TipRateStats = {
  rate: number; // 投げ銭率（%）= 投げ銭あり記事数 / 公開済み記事総数 × 100
  totalPosts: number; // 公開済み記事総数（published=true）
  tippedPosts: number; // 投げ銭あり記事数（confirmed Tip が1件以上）
  tipperUsers: number; // 投げ銭ユーザー数（confirmed Tip の fromAddress ユニーク数）
  totalXym: number; // 累計流通額（confirmed Tip の amount 合計）
  reactionsTotal: number; // リアクション総数
  avgRate30d: number; // 直近30日の日別投げ銭率の平均（%）
  maxRate: number; // 日別投げ銭率の最高記録（%）
  maxRateDate: string | null; // 最高記録の日付（YYYY-MM-DD・JST）
  days100: number; // 日別投げ銭率=100% を達成した日数（累計）
  topTipDay: { date: string; xym: number } | null; // 投げ銭額が最も多かった日
};

// 日別投げ銭率は「その日に公開された記事のうち、投げ銭された記事の割合」で定義する
// （公開日コホート方式）。100% = その日公開の全記事が投げ銭を受けた、を意味する。
const DAY_MS = 24 * 60 * 60 * 1000;

async function compute(): Promise<TipRateStats> {
  const [allPosts, allTips, reactionsTotal] = await Promise.all([
    // 公開済み記事すべて（公開日と confirmed Tip 件数）。lib/home.ts でも全件取得しており踏襲。
    prisma.post.findMany({
      where: { published: true },
      select: {
        createdAt: true,
        _count: { select: { tips: { where: { confirmed: true } } } },
      },
    }),
    // confirmed Tip すべて（日別集計・ユニークユーザー・流通額に使用）。
    prisma.tip.findMany({
      where: { confirmed: true },
      select: { confirmedAt: true, amount: true, fromAddress: true },
    }),
    prisma.reaction.count(),
  ]);

  const totalPosts = allPosts.length;
  const tippedPosts = allPosts.filter((p) => p._count.tips > 0).length;
  const rate = totalPosts > 0 ? (tippedPosts / totalPosts) * 100 : 0;

  const tipperUsers = new Set(allTips.map((t) => t.fromAddress)).size;
  const totalXym = allTips.reduce((s, t) => s + Number(t.amount), 0);

  // 公開日コホートで日別の {公開数, 投げ銭あり数} を集計。
  const byDay = new Map<string, { published: number; tipped: number }>();
  for (const p of allPosts) {
    const day = jstDateString(p.createdAt);
    const b = byDay.get(day) ?? { published: 0, tipped: 0 };
    b.published++;
    if (p._count.tips > 0) b.tipped++;
    byDay.set(day, b);
  }

  // 最高記録・100%達成日数（累計・全期間）。
  let maxRate = 0;
  let maxRateDate: string | null = null;
  let days100 = 0;
  for (const [day, b] of byDay) {
    if (b.published === 0) continue;
    const r = (b.tipped / b.published) * 100;
    if (r > maxRate) {
      maxRate = r;
      maxRateDate = day;
    }
    if (b.tipped === b.published) days100++;
  }

  // 直近30日（今日含む）の日別率の平均。記事公開のあった日のみを母数にする。
  const cutoff = jstDateString(new Date(Date.now() - 29 * DAY_MS));
  let sum = 0;
  let n = 0;
  for (const [day, b] of byDay) {
    if (b.published === 0 || day < cutoff) continue;
    sum += (b.tipped / b.published) * 100;
    n++;
  }
  const avgRate30d = n > 0 ? sum / n : 0;

  // 投げ銭額が最も多かった日（confirmedAt の JST 日付で集計）。
  const tipByDay = new Map<string, number>();
  for (const t of allTips) {
    const day = jstDateString(t.confirmedAt);
    tipByDay.set(day, (tipByDay.get(day) ?? 0) + Number(t.amount));
  }
  let topTipDay: { date: string; xym: number } | null = null;
  for (const [day, xym] of tipByDay) {
    if (!topTipDay || xym > topTipDay.xym) topTipDay = { date: day, xym };
  }

  return {
    rate,
    totalPosts,
    tippedPosts,
    tipperUsers,
    totalXym,
    reactionsTotal,
    avgRate30d,
    maxRate,
    maxRateDate,
    days100,
    topTipDay,
  };
}

// 負荷軽減のためデータ層で 5 分キャッシュ。
export const getTipRateStats = unstable_cache(compute, ["tip-rate-stats-v1"], {
  revalidate: 300,
});
