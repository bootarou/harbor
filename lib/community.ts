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
  authorAddress: string | null; // 投稿者の受取アドレス（投げ銭の送金先・null なら投げ銭不可）
  stamp: { id: string; name: string; imageUrl: string } | null;
  tipTotal: number;
  tipCount: number;
};

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  tipTotal: true,
  tipCount: true,
  user: { select: { id: true, displayName: true, avatarUrl: true, xymAddress: true } },
  stamp: { select: { id: true, name: true, imageUrl: true } },
} as const;

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  tipTotal: unknown;
  tipCount: number;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    xymAddress: string | null;
  };
  stamp: { id: string; name: string; imageUrl: string } | null;
};

export function shapeMessage(m: MessageRow): CommunityMessageView {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    userId: m.userId,
    user: { id: m.user.id, displayName: m.user.displayName, avatarUrl: m.user.avatarUrl },
    authorAddress: m.user.xymAddress,
    stamp: m.stamp,
    tipTotal: Number(m.tipTotal),
    tipCount: m.tipCount,
  };
}

// チャット表示から除外する条件（通報 hidden ＝ または論理削除 deletedAt）。
// 投げ銭記録・収益では削除後も引き続き利用される（メッセージ行は残る）。
const VISIBLE_WHERE = { hidden: false, deletedAt: null } as const;

// トピックの表示用メッセージ（表示可能・最新 MESSAGE_KEEP 件・昇順＝下が最新）。
// 投げ銭記録の保全のためメッセージは全件DB保持し、ここは「最新100件の窓」として表示する。
export async function getTopicMessages(
  topicId: string
): Promise<CommunityMessageView[]> {
  const rows = await prisma.communityMessage.findMany({
    where: { topicId, ...VISIBLE_WHERE },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_KEEP,
    select: MESSAGE_SELECT,
  });
  return rows.reverse().map(shapeMessage);
}

// 差分取得（after より後の表示可能メッセージを昇順で）。
export async function getMessagesAfter(
  topicId: string,
  after: Date
): Promise<CommunityMessageView[]> {
  const rows = await prisma.communityMessage.findMany({
    where: { topicId, ...VISIBLE_WHERE, createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: MESSAGE_KEEP,
    select: MESSAGE_SELECT,
  });
  return rows.map(shapeMessage);
}

// 表示中（窓）のメッセージの投げ銭合計スナップショット。既存メッセージへの投げ銭を
// 差分ポーリングで反映するために使う（新着メッセージの after 差分では拾えないため）。
export async function getTipTotalsForVisible(
  topicId: string
): Promise<Record<string, { tipTotal: number; tipCount: number }>> {
  const rows = await prisma.communityMessage.findMany({
    where: { topicId, ...VISIBLE_WHERE },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_KEEP,
    select: { id: true, tipTotal: true, tipCount: true },
  });
  const map: Record<string, { tipTotal: number; tipCount: number }> = {};
  for (const r of rows) map[r.id] = { tipTotal: Number(r.tipTotal), tipCount: r.tipCount };
  return map;
}
