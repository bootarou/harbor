import "server-only";
import { prisma } from "@/lib/prisma";
import { livePostWhere } from "@/lib/posts";

// 「出会いを待つ記事」用: まだ投げ銭（confirmed Tip）が1件も無い公開記事をランダムに取得する。
// 内容の評価ではなく「最初の灯りを灯す」出会いを促す。常に新鮮なランダム結果（キャッシュしない）。
// 「もっと見る」では既に表示済みの id を除外して追加分を返す。

export type UndiscoveredPost = {
  id: string;
  title: string;
  createdAt: string; // ISO 文字列（クライアントへ渡すためシリアライズ）
  author: { id: string; displayName: string; xymAddress: string | null };
};

export type UndiscoveredResult = {
  posts: UndiscoveredPost[];
  // お祝い状態: 公開記事が1件以上あり、かつ全記事に投げ銭が届いた（未灯ゼロ）。
  // 公開記事ゼロ（空の港）のときは false（posts も空）。
  allDiscovered: boolean;
  // 今回返した分を除いても、まだ未表示の未灯記事が残っているか（「もっと見る」表示判定）。
  hasMore: boolean;
};

// Fisher–Yates シャッフル（生SQLの ORDER BY RANDOM() が使えないため JS で抽選）。
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getUndiscoveredPosts(opts: {
  limit: number;
  excludeIds?: string[]; // 「もっと見る」で既に表示済みの記事 id（重複排除）
}): Promise<UndiscoveredResult> {
  const where = {
    AND: [
      livePostWhere(),
      // confirmed な Tip が1件も無い記事のみ。
      // 自分の記事も含めて表示し（除外しない）、ボタン側で「自分の記事は応援ボタン非表示」とする。
      { tips: { none: { confirmed: true } } },
      // 既に表示済みの記事は除外（「もっと見る」で追加分のみ返す）。
      ...(opts.excludeIds && opts.excludeIds.length
        ? [{ id: { notIn: opts.excludeIds } }]
        : []),
    ],
  };

  // まず候補 id（表示済みを除外した未灯記事）だけを軽く取得。
  const ids = await prisma.post.findMany({ where, select: { id: true } });
  // 今回返す分を除いても残りがあるか（「もっと見る」表示判定）。
  const hasMore = ids.length > opts.limit;

  // お祝い（allDiscovered）はグローバル基準で判定する:
  //   公開記事が1件以上 かつ 未灯（confirmed Tip ゼロ）の記事が globally 0件 のときだけ true。
  // これにより「そもそも公開記事ゼロ（空の港）」を 100%扱いしてしまう乖離を防ぐ。
  const [totalLive, globalUndiscovered] = await Promise.all([
    prisma.post.count({ where: livePostWhere() }),
    prisma.post.count({
      where: { AND: [livePostWhere(), { tips: { none: { confirmed: true } } }] },
    }),
  ]);
  const allDiscovered = totalLive > 0 && globalUndiscovered === 0;

  if (ids.length === 0) return { posts: [], allDiscovered, hasMore: false };

  const picked = shuffle(ids)
    .slice(0, opts.limit)
    .map((x) => x.id);

  const rows = await prisma.post.findMany({
    where: { id: { in: picked } },
    select: {
      id: true,
      title: true,
      createdAt: true,
      author: { select: { id: true, displayName: true, xymAddress: true } },
    },
  });

  // in クエリは順序を保証しないため picked の抽選順に並べ直す。
  const byId = new Map(rows.map((r) => [r.id, r]));
  const posts: UndiscoveredPost[] = picked
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      author: {
        id: r.author.id,
        displayName: r.author.displayName,
        xymAddress: r.author.xymAddress,
      },
    }));

  return { posts, allDiscovered, hasMore };
}
