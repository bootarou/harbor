import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { htmlToText } from "@/lib/sanitize";
import type { TipperInfo } from "@/components/tip/tipper-avatars";

// 確定済み投げ銭の先頭7件（confirmedAt 昇順）から Tipper アイコン情報を組み立てる。
// shown は最大7件、moreCount は 6人を超えた人数（「+N」表示用）。
export function buildTippers(
  tips: {
    confirmed: boolean;
    anonymous: boolean;
    fromUserId: string | null;
    fromUser: { avatarUrl: string | null; displayName: string | null } | null;
  }[]
): { tippers: TipperInfo[]; moreCount: number } {
  // confirmedAt 昇順で渡される前提（呼び出し側の orderBy に依存）。
  const confirmed = tips.filter((t) => t.confirmed);
  const tippers: TipperInfo[] = confirmed.slice(0, 7).map((t, i) => ({
    userId: t.fromUserId,
    avatarUrl: t.anonymous ? null : t.fromUser?.avatarUrl ?? null,
    displayName: t.anonymous ? null : t.fromUser?.displayName ?? null,
    anonymous: t.anonymous,
    isFirst: i === 0,
  }));
  return { tippers, moreCount: Math.max(0, confirmed.length - 6) };
}

// 「実際に公開中」の条件:
// published=true かつ（公開日時が未設定 or 現在時刻以前）。
// 予約投稿（publishAt が未来）は一般の一覧・詳細から除外する。
export function livePostWhere(): Prisma.PostWhereInput {
  return {
    published: true,
    OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
  };
}

export const FEED_PAGE_SIZE = 12;

// 一覧の絞り込み条件（公開中 + タグ + 全文検索）。
export function buildPostWhere(opts: {
  q?: string;
  tag?: string;
}): Prisma.PostWhereInput {
  const q = opts.q?.trim() ?? "";
  const tag = opts.tag?.trim() ?? "";
  const conds: Prisma.PostWhereInput[] = [livePostWhere()];
  if (tag) conds.push({ tags: { has: tag } });
  if (q) {
    conds.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { contentHTML: { contains: q, mode: "insensitive" } },
        { comment: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: conds };
}

export type FeedPost = {
  id: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  createdAt: Date;
  viewCount: number;
  paid: boolean;
  priceAmount: number | null;
  priceCurrency: string | null;
  postType: string;
  qaStatus: string | null;
  comment: string | null;
  ogpTitle: string | null;
  ogpImageUrl: string | null;
  ogpSiteName: string | null;
  author: { displayName: string; avatarUrl: string | null };
  tip: { total: number; count: number };
  tippers: TipperInfo[];
  tipperMoreCount: number;
  thanksCount: number;
  thanksStatus: string;
  isArchived: boolean;
};

// 一覧の1ページ分を取得する（投げ銭集計込み）。
// hasMore 判定のため pageSize+1 件取得して余りで判定する（count クエリ不要）。
export async function getPostsPage(opts: {
  page: number;
  q?: string;
  tag?: string;
  pageSize?: number;
}): Promise<{ posts: FeedPost[]; hasMore: boolean }> {
  const pageSize = opts.pageSize ?? FEED_PAGE_SIZE;
  const page = Math.max(1, opts.page);
  const where = buildPostWhere({ q: opts.q, tag: opts.tag });

  const rows = await prisma.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    select: {
      id: true,
      title: true,
      contentHTML: true,
      coverImage: true,
      tags: true,
      createdAt: true,
      viewCount: true,
      paid: true,
      priceAmount: true,
      priceCurrency: true,
      postType: true,
      qaStatus: true,
      comment: true,
      ogpTitle: true,
      ogpImageUrl: true,
      ogpSiteName: true,
      thanksCount: true,
      thanksStatus: true,
      isArchived: true,
      author: { select: { displayName: true, avatarUrl: true } },
      // 記事への投げ銭のみ集計（回答への投げ銭 answerId!=null は除外）。
      // Tipper アイコン（先着順）にも使うため confirmedAt 昇順で取得し、
      // 送信者のアイコン/表示名も一括 join（投稿ごと1クエリ・N+1なし）。
      tips: {
        where: { answerId: null },
        orderBy: { confirmedAt: "asc" },
        select: {
          amount: true,
          confirmed: true,
          anonymous: true,
          fromUserId: true,
          fromUser: { select: { avatarUrl: true, displayName: true } },
        },
      },
    },
  });

  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  const posts: FeedPost[] = sliced.map((r) => {
    const { tippers, moreCount } = buildTippers(r.tips);
    return {
    id: r.id,
    title: r.title,
    excerpt:
      r.postType === "external_url"
        ? r.comment ?? ""
        : htmlToText(r.contentHTML, 80),
    coverImage: r.coverImage,
    tags: r.tags,
    createdAt: r.createdAt,
    viewCount: r.viewCount,
    paid: r.paid,
    priceAmount: r.priceAmount != null ? Number(r.priceAmount) : null,
    priceCurrency: r.priceCurrency,
    postType: r.postType,
    qaStatus: r.qaStatus,
    comment: r.comment,
    ogpTitle: r.ogpTitle,
    ogpImageUrl: r.ogpImageUrl,
    ogpSiteName: r.ogpSiteName,
    author: r.author,
    tip: {
      total: r.tips.reduce((s, t) => s + Number(t.amount), 0),
      count: r.tips.length,
    },
    tippers,
    tipperMoreCount: moreCount,
    thanksCount: r.thanksCount,
    thanksStatus: r.thanksStatus,
    isArchived: r.isArchived,
    };
  });
  return { posts, hasMore };
}
