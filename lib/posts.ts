import type { Prisma } from "@prisma/client";

// 「実際に公開中」の条件:
// published=true かつ（公開日時が未設定 or 現在時刻以前）。
// 予約投稿（publishAt が未来）は一般の一覧・詳細から除外する。
export function livePostWhere(): Prisma.PostWhereInput {
  return {
    published: true,
    OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
  };
}
