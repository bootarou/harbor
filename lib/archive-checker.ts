import "server-only";
import { prisma } from "@/lib/prisma";

// Harbor Archive（殿堂入り）の自動判定。
// 条件: thanksStatus="discovery" かつ 公開から30日以上 かつ 通報なし。
// 既存の poll-tips と同じく cron から定期実行する。一度 Archive 入りした記事は
// 文化として残すため自動解除はしない（昇格のみ）。
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function checkAndUpdateArchives(): Promise<{ archived: number }> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  // 「公開から30日以上」= 予約投稿は publishAt、通常は createdAt を公開時刻とみなす。
  const candidates = await prisma.post.findMany({
    where: {
      published: true,
      isArchived: false,
      thanksStatus: "discovery",
      reports: { none: {} },
      OR: [
        { publishAt: { lte: cutoff } },
        { AND: [{ publishAt: null }, { createdAt: { lte: cutoff } }] },
      ],
    },
    select: { id: true },
  });

  if (candidates.length === 0) return { archived: 0 };

  const result = await prisma.post.updateMany({
    where: { id: { in: candidates.map((p) => p.id) } },
    data: { isArchived: true },
  });

  return { archived: result.count };
}
