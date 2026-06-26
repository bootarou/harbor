import "server-only";
import { prisma } from "@/lib/prisma";
import { livePostWhere } from "@/lib/posts";

// トップページのハイライト用データ。すべて Prisma 集計（生SQL不使用）。

export type TipRankRow = {
  id: string;
  title: string;
  author: string;
  totalXym: number;
  count: number;
};

export type AccessRankRow = {
  id: string;
  title: string;
  author: string;
  viewCount: number;
  likes: number;
};

export type FeaturedRow = {
  id: string;
  title: string;
  author: string;
  score: number;
  hot: boolean; // 急上昇
};

export type TickerRow = {
  id: string;
  title: string;
  postId: string;
  who: string; // 送信者表示名（匿名は「匿名」）
  amountXym: number;
};

export type ArchiveRow = {
  id: string;
  title: string;
  author: string;
};

export type HomeHighlights = {
  archive: ArchiveRow[];
  tipRanking: TipRankRow[];
  accessRanking: AccessRankRow[];
  featured: FeaturedRow[];
  ticker: TickerRow[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getHomeHighlights(): Promise<HomeHighlights> {
  const weekAgo = new Date(Date.now() - WEEK_MS);

  const [archivePosts, tipGroups, accessPosts, featuredCandidates, recentTips] =
    await Promise.all([
      // Harbor Archive: 殿堂入り記事（公開中）を最新順で最大3件。
      prisma.post.findMany({
        where: { AND: [livePostWhere(), { isArchived: true }] },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          author: { select: { displayName: true } },
        },
      }),
      // 投げ銭ランキング（今週）: 直近7日の投げ銭額合計上位。
      prisma.tip.groupBy({
        by: ["postId"],
        where: { confirmedAt: { gte: weekAgo } },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
        take: 10,
      }),
      // アクセスランキング: 公開中記事を PV 降順。
      prisma.post.findMany({
        where: livePostWhere(),
        orderBy: { viewCount: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          viewCount: true,
          author: { select: { displayName: true } },
          _count: { select: { reactions: true } },
        },
      }),
      // 注目記事（過去7日）: いいね＋投げ銭の複合スコア候補。
      prisma.post.findMany({
        where: { AND: [livePostWhere(), { createdAt: { gte: weekAgo } }] },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          author: { select: { displayName: true } },
          _count: { select: { reactions: true, tips: true } },
        },
      }),
      // 投げ銭ティッカー: 直近の投げ銭。
      prisma.tip.findMany({
        where: { post: livePostWhere() },
        orderBy: { confirmedAt: "desc" },
        take: 12,
        select: {
          id: true,
          amount: true,
          anonymous: true,
          post: { select: { id: true, title: true } },
          fromUser: { select: { displayName: true } },
        },
      }),
    ]);

  // 投げ銭ランキング: 公開中の記事のみ採用し、合計額順を維持。
  const tipPostIds = tipGroups.map((g) => g.postId);
  const tipPosts = tipPostIds.length
    ? await prisma.post.findMany({
        where: { AND: [livePostWhere(), { id: { in: tipPostIds } }] },
        select: { id: true, title: true, author: { select: { displayName: true } } },
      })
    : [];
  const tipPostMap = new Map(tipPosts.map((p) => [p.id, p]));
  const tipRanking: TipRankRow[] = tipGroups
    .map((g) => {
      const p = tipPostMap.get(g.postId);
      if (!p) return null;
      return {
        id: p.id,
        title: p.title,
        author: p.author.displayName,
        totalXym: g._sum.amount ? Number(g._sum.amount) : 0,
        count: g._count,
      };
    })
    .filter((r): r is TipRankRow => r !== null)
    .slice(0, 5);

  const accessRanking: AccessRankRow[] = accessPosts.map((p) => ({
    id: p.id,
    title: p.title,
    author: p.author.displayName,
    viewCount: p.viewCount,
    likes: p._count.reactions,
  }));

  const featured: FeaturedRow[] = featuredCandidates
    .map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author.displayName,
      // いいね + 投げ銭件数（投げ銭は重み付け）の複合スコア。
      score: p._count.reactions + p._count.tips * 2,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => ({ ...r, hot: r.score >= 3 }));

  const ticker: TickerRow[] = recentTips.map((t) => ({
    id: t.id,
    title: t.post.title,
    postId: t.post.id,
    who: t.anonymous ? "匿名" : t.fromUser?.displayName ?? "匿名",
    amountXym: Number(t.amount),
  }));

  const archive: ArchiveRow[] = archivePosts.map((p) => ({
    id: p.id,
    title: p.title,
    author: p.author.displayName,
  }));

  return { archive, tipRanking, accessRanking, featured, ticker };
}
