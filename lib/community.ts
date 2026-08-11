import "server-only";
import { prisma } from "@/lib/prisma";

// 表示・物理削除の基準となる保持件数（hidden=false のメッセージ）。
export const MESSAGE_KEEP = 100;

export type CommunityMessageView = {
  id: string;
  body: string;
  createdAt: string; // ISO
  userId: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null };
  stamp: { id: string; name: string; imageUrl: string } | null;
};

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, displayName: true, avatarUrl: true } },
  stamp: { select: { id: true, name: true, imageUrl: true } },
} as const;

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null };
  stamp: { id: string; name: string; imageUrl: string } | null;
};

export function shapeMessage(m: MessageRow): CommunityMessageView {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    userId: m.userId,
    user: m.user,
    stamp: m.stamp,
  };
}

// トピックの表示用メッセージ（hidden=false・最新 MESSAGE_KEEP 件・昇順＝下が最新）。
export async function getTopicMessages(
  topicId: string
): Promise<CommunityMessageView[]> {
  const rows = await prisma.communityMessage.findMany({
    where: { topicId, hidden: false },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_KEEP,
    select: MESSAGE_SELECT,
  });
  return rows.reverse().map(shapeMessage);
}

// 差分取得（after より後の hidden=false メッセージを昇順で）。
export async function getMessagesAfter(
  topicId: string,
  after: Date
): Promise<CommunityMessageView[]> {
  const rows = await prisma.communityMessage.findMany({
    where: { topicId, hidden: false, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: MESSAGE_KEEP,
    select: MESSAGE_SELECT,
  });
  return rows.map(shapeMessage);
}

// 最新 MESSAGE_KEEP 件（hidden=false）を残し、それより古い hidden=false を物理削除する。
// hidden=true（通報済み）は件数に数えず削除もしない（法的対応のためログ保持）。
export async function trimTopicMessages(topicId: string): Promise<void> {
  const old = await prisma.communityMessage.findMany({
    where: { topicId, hidden: false },
    orderBy: { createdAt: "desc" },
    skip: MESSAGE_KEEP,
    select: { id: true },
  });
  if (old.length === 0) return;
  await prisma.communityMessage.deleteMany({
    where: { id: { in: old.map((o) => o.id) } },
  });
}
