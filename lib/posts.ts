import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { htmlToText } from "@/lib/sanitize";

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
  comment: string | null;
  ogpTitle: string | null;
  ogpImageUrl: string | null;
  ogpSiteName: string | null;
  author: { displayName: string; avatarUrl: string | null };
  tip: { total: number; count: number };
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
      comment: true,
      ogpTitle: true,
      ogpImageUrl: true,
      ogpSiteName: true,
      author: { select: { displayName: true, avatarUrl: true } },
      tips: { select: { amount: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  const posts: FeedPost[] = sliced.map((r) => ({
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
    comment: r.comment,
    ogpTitle: r.ogpTitle,
    ogpImageUrl: r.ogpImageUrl,
    ogpSiteName: r.ogpSiteName,
    author: r.author,
    tip: {
      total: r.tips.reduce((s, t) => s + Number(t.amount), 0),
      count: r.tips.length,
    },
  }));
  return { posts, hasMore };
}
