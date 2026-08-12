import "server-only";
import { prisma } from "@/lib/prisma";

export type StampCardData = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  price: number;
  placements: number;
  author: { id: string; displayName: string | null; xymAddress: string | null };
};

// 現在のユーザーが使用権を持つスタンプ ID の集合。
// 購入はオンチェーン検証OKのときだけ記録されるため、未確定(confirmed=false)でも
// 使用権あり（＝所持）として扱う（有料記事の解除と同じ方針）。
export async function getOwnedStampIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.stampPurchase.findMany({
    where: { buyerId: userId },
    select: { stampId: true },
  });
  return new Set(rows.map((r) => r.stampId));
}

type StampRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  price: unknown;
  _count: { placements: number };
  author: { id: string; displayName: string | null; xymAddress: string | null };
};

function toCard(s: StampRow): StampCardData {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    imageUrl: s.imageUrl,
    price: Number(s.price),
    placements: s._count.placements,
    author: s.author,
  };
}

const CARD_SELECT = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  price: true,
  _count: { select: { placements: true } },
  author: { select: { id: true, displayName: true, xymAddress: true } },
} as const;

// ショップ用: 公開中スタンプ一覧（新着順 or 人気順＝貼付数順・作者フィルタ）。
export async function getShopStamps(opts: {
  sort?: "new" | "popular";
  authorId?: string;
}): Promise<StampCardData[]> {
  const rows = await prisma.stamp.findMany({
    where: { published: true, ...(opts.authorId ? { authorId: opts.authorId } : {}) },
    orderBy:
      opts.sort === "popular"
        ? [{ placements: { _count: "desc" } }, { createdAt: "desc" }]
        : { createdAt: "desc" },
    select: CARD_SELECT,
    take: 120,
  });
  return rows.map(toCard);
}

export type PlaceableStamp = { id: string; name: string; imageUrl: string };

// 記事に貼れるスタンプ（＝使用権を持つもの）: 購入済み(confirmed) ＋ 自作スタンプ。
export async function getPlaceableStamps(
  userId: string | null
): Promise<PlaceableStamp[]> {
  if (!userId) return [];
  const [purchased, authored] = await Promise.all([
    prisma.stampPurchase.findMany({
      where: { buyerId: userId },
      select: { stamp: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { purchasedAt: "desc" },
    }),
    prisma.stamp.findMany({
      where: { authorId: userId },
      select: { id: true, name: true, imageUrl: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const map = new Map<string, PlaceableStamp>();
  for (const p of purchased) map.set(p.stamp.id, p.stamp);
  for (const a of authored) map.set(a.id, a);
  return [...map.values()];
}

export type PostStampPlacement = {
  stampId: string;
  name: string;
  imageUrl: string;
  count: number;
};

// 記事に貼られたスタンプを種類ごとに集計（枚数まとめ表示用・多い順）。
export async function getPostStampPlacements(
  postId: string
): Promise<PostStampPlacement[]> {
  const groups = await prisma.stampPlacement.groupBy({
    by: ["stampId"],
    where: { postId },
    _count: { stampId: true },
  });
  if (groups.length === 0) return [];
  const stamps = await prisma.stamp.findMany({
    where: { id: { in: groups.map((g) => g.stampId) } },
    select: { id: true, name: true, imageUrl: true },
  });
  const info = new Map(stamps.map((s) => [s.id, s]));
  return groups
    .map((g) => {
      const s = info.get(g.stampId);
      return s
        ? { stampId: g.stampId, name: s.name, imageUrl: s.imageUrl, count: g._count.stampId }
        : null;
    })
    .filter((x): x is PostStampPlacement => x !== null)
    .sort((a, b) => b.count - a.count);
}

// 公開プロフィール用: そのユーザーが作成した公開スタンプ。
export async function getUserPublishedStamps(authorId: string): Promise<StampCardData[]> {
  const rows = await prisma.stamp.findMany({
    where: { published: true, authorId },
    orderBy: { createdAt: "desc" },
    select: CARD_SELECT,
    take: 60,
  });
  return rows.map(toCard);
}
