import "server-only";
import { prisma } from "@/lib/prisma";

// 自動アーカイブの無投稿期間（30日）。
export const ARCHIVE_AFTER_DAYS = 30;

// 最終投稿から ARCHIVE_AFTER_DAYS 日以上経過した未アーカイブのトピックをアーカイブする。
// lastPostedAt が null（一度も投稿がない）トピックは createdAt を基準にする。
export async function archiveStaleTopics(): Promise<number> {
  const threshold = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const res = await prisma.communityTopic.updateMany({
    where: {
      archived: false,
      OR: [
        { lastPostedAt: { lt: threshold } },
        { lastPostedAt: null, createdAt: { lt: threshold } },
      ],
    },
    data: { archived: true },
  });
  return res.count;
}
