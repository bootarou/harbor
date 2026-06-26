import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { livePostWhere } from "@/lib/posts";
import { jstDayStart, jstMonthStart } from "@/lib/date";
import { THANKS_STATUSES, type ThanksStatus } from "@/lib/thanks-status";

// Harbor Dashboard（/status）用の集計。すべて Prisma 集計（生SQL不使用）。
// 認証不要・公開情報のみ。負荷軽減のためページ側で revalidate キャッシュする想定。

export type StatusCounts = Record<ThanksStatus, number>;

// あと少しで出港 / Discovery目前 用の記事行。
export type ProgressPostRow = {
  id: string;
  title: string;
  author: string;
  thanksCount: number;
};

export type ArchiveHighlight = {
  id: string;
  title: string;
  author: string;
};

export type TipStats = {
  totalCount: number; // 累計投げ銭回数（confirmed）
  monthCount: number; // 今月の投げ銭回数（JST）
  todayCount: number; // 今日の投げ銭回数（JST）
  tippedPosts: number; // 投げ銭された記事のユニーク数
  tipperUsers: number; // 投げ銭したユニークユーザー数
  totalXym: number; // 累計流通額（XYM）
  monthXym: number; // 今月流通額（XYM）
};

export type HarborStatus = {
  // セクション1: Harbor Status
  publishedPosts: number;
  thanksTotal: number;
  statusCounts: StatusCounts;
  archiveCount: number;
  // セクション2: Today's Harbor
  today: {
    newPosts: number;
    thanks: number;
    sailed: number;
    discovery: number;
  };
  // セクション3/4: 進捗中の記事
  almostSailed: ProgressPostRow[];
  almostDiscovery: ProgressPostRow[];
  // セクション5: Harbor Archive ハイライト（最新1件）
  archiveHighlight: ArchiveHighlight | null;
  // セクション7: 投げ銭統計
  tipStats: TipStats;
};

// sailed 到達に必要な Thanks 数 / discovery 到達に必要な Thanks 数（thanks-status の定義から取得）。
const SAILED_MIN =
  THANKS_STATUSES.find((s) => s.key === "sailed")?.min ?? 6;
const DISCOVERY_MIN =
  THANKS_STATUSES.find((s) => s.key === "discovery")?.min ?? 100;
export { SAILED_MIN, DISCOVERY_MIN };

// データ層で 5 分キャッシュ（リアルタイム性より負荷軽減を優先）。
// ページ自体は認証不要だが force-dynamic で都度レンダリングし、重い集計のみここでキャッシュする。
export const getHarborStatusCached = unstable_cache(
  () => getHarborStatus(),
  ["harbor-status-v1"],
  { revalidate: 300 }
);

export async function getHarborStatus(): Promise<HarborStatus> {
  const todayStart = jstDayStart();
  const monthStart = jstMonthStart();
  const live = livePostWhere();

  const [
    publishedPosts,
    thanksTotal,
    statusGroups,
    archiveCount,
    todayNewPosts,
    todayThanks,
    todaySailed,
    todayDiscovery,
    almostSailedRaw,
    almostDiscoveryRaw,
    archiveHighlightRaw,
    tipTotalCount,
    tipMonthCount,
    tipTodayCount,
    tippedPostGroups,
    tipperUserGroups,
    tipTotalAgg,
    tipMonthAgg,
  ] = await Promise.all([
    // --- セクション1 ---
    prisma.post.count({ where: live }),
    prisma.thanks.count(),
    prisma.post.groupBy({
      by: ["thanksStatus"],
      where: live,
      _count: { _all: true },
    }),
    prisma.post.count({ where: { AND: [live, { isArchived: true }] } }),
    // --- セクション2（JST 今日） ---
    prisma.post.count({
      where: { AND: [live, { createdAt: { gte: todayStart } }] },
    }),
    prisma.thanks.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.post.count({ where: { sailedAt: { gte: todayStart } } }),
    prisma.post.count({ where: { archivedAt: { gte: todayStart } } }),
    // --- セクション3: あと少しで出港（preparing を sailed に近い順） ---
    prisma.post.findMany({
      where: { AND: [live, { thanksStatus: "preparing" }] },
      orderBy: { thanksCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        thanksCount: true,
        author: { select: { displayName: true } },
      },
    }),
    // --- セクション4: Discovery目前（voyaging を discovery に近い順） ---
    prisma.post.findMany({
      where: { AND: [live, { thanksStatus: "voyaging" }] },
      orderBy: { thanksCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        thanksCount: true,
        author: { select: { displayName: true } },
      },
    }),
    // --- セクション5: Archive ハイライト（最新1件） ---
    prisma.post.findFirst({
      where: { AND: [live, { isArchived: true }] },
      orderBy: [
        { archivedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        author: { select: { displayName: true } },
      },
    }),
    // --- セクション7: 投げ銭統計 ---
    prisma.tip.count({ where: { confirmed: true } }),
    prisma.tip.count({
      where: { confirmed: true, confirmedAt: { gte: monthStart } },
    }),
    prisma.tip.count({
      where: { confirmed: true, confirmedAt: { gte: todayStart } },
    }),
    prisma.tip.groupBy({ by: ["postId"], where: { confirmed: true } }),
    prisma.tip.groupBy({
      by: ["fromUserId"],
      where: { confirmed: true, fromUserId: { not: null } },
    }),
    prisma.tip.aggregate({ _sum: { amount: true }, where: { confirmed: true } }),
    prisma.tip.aggregate({
      _sum: { amount: true },
      where: { confirmed: true, confirmedAt: { gte: monthStart } },
    }),
  ]);

  // ステータス別件数を全キー 0 埋めで構築。
  const statusCounts = THANKS_STATUSES.reduce((acc, s) => {
    acc[s.key] = 0;
    return acc;
  }, {} as StatusCounts);
  for (const g of statusGroups) {
    if (g.thanksStatus in statusCounts) {
      statusCounts[g.thanksStatus as ThanksStatus] = g._count._all;
    }
  }

  const toRow = (p: {
    id: string;
    title: string;
    thanksCount: number;
    author: { displayName: string };
  }): ProgressPostRow => ({
    id: p.id,
    title: p.title,
    author: p.author.displayName,
    thanksCount: p.thanksCount,
  });

  // 残り Thanks が少ない順（= thanksCount 多い順）を維持しつつ整形。
  const almostSailed = almostSailedRaw.map(toRow);
  const almostDiscovery = almostDiscoveryRaw.map(toRow);

  const archiveHighlight: ArchiveHighlight | null = archiveHighlightRaw
    ? {
        id: archiveHighlightRaw.id,
        title: archiveHighlightRaw.title,
        author: archiveHighlightRaw.author.displayName,
      }
    : null;

  const tipStats: TipStats = {
    totalCount: tipTotalCount,
    monthCount: tipMonthCount,
    todayCount: tipTodayCount,
    tippedPosts: tippedPostGroups.length,
    tipperUsers: tipperUserGroups.length,
    totalXym: tipTotalAgg._sum.amount ? Number(tipTotalAgg._sum.amount) : 0,
    monthXym: tipMonthAgg._sum.amount ? Number(tipMonthAgg._sum.amount) : 0,
  };

  return {
    publishedPosts,
    thanksTotal,
    statusCounts,
    archiveCount,
    today: {
      newPosts: todayNewPosts,
      thanks: todayThanks,
      sailed: todaySailed,
      discovery: todayDiscovery,
    },
    almostSailed,
    almostDiscovery,
    archiveHighlight,
    tipStats,
  };
}
