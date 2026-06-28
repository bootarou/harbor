import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostFeed } from "@/components/post-feed";
import { HomeHighlights } from "@/components/home-highlights";
import { TipRateIndicator } from "@/components/top/tip-rate-indicator";
import { FeedChips } from "@/components/feed-chips";
import { buildPostWhere, getPostsPage, livePostWhere } from "@/lib/posts";
import { getHomeHighlights } from "@/lib/home";
import { getTipRateStats } from "@/lib/tip-rate";

function buildQuery(opts: { q?: string; tag?: string }): string {
  const sp = new URLSearchParams();
  if (opts.q) sp.set("q", opts.q);
  if (opts.tag) sp.set("tag", opts.tag);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const tag = sp.tag?.trim() ?? "";

  const session = await auth();
  const me = session?.user?.id ?? null;

  // ログイン時はフォロー中著者を取得（チップ表示＋新着バッジ判定に使う）。
  // 「フォロー中」チップは既存の /feed ページへ遷移する。
  let followingUsers: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  }[] = [];
  let latestFollowingPostAt: string | null = null;
  if (me) {
    const follows = await prisma.follow.findMany({
      where: { followerId: me },
      orderBy: { createdAt: "desc" },
      select: {
        following: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    followingUsers = follows.map((f) => f.following);
    const followingIds = followingUsers.map((u) => u.id);
    if (followingIds.length > 0) {
      const latest = await prisma.post.findFirst({
        where: { AND: [livePostWhere(), { authorId: { in: followingIds } }] },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      latestFollowingPostAt = latest?.createdAt.toISOString() ?? null;
    }
  }

  const filtering = q !== "" || tag !== "";

  const [{ posts, hasMore }, total, tagRows, highlights, tipRate] = await Promise.all([
    getPostsPage({ page: 1, q, tag }),
    filtering ? prisma.post.count({ where: buildPostWhere({ q, tag }) }) : Promise.resolve(0),
    // タグナビ用（公開中の記事のタグを集計）
    prisma.post.findMany({ where: livePostWhere(), select: { tags: true } }),
    // トップのハイライト（絞り込み中は不要）
    filtering ? Promise.resolve(null) : getHomeHighlights(),
    // 投げ銭率インジケーター（絞り込み中は不要）
    filtering ? Promise.resolve(null) : getTipRateStats(),
  ]);

  // 上位タグ
  const tagCounts = new Map<string, number>();
  for (const r of tagRows) {
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return (
    <main className="mx-auto w-full max-w-6xl px-2 py-10 sm:px-6">
      {/* 投げ銭率インジケーター（最上部・絞り込み中は非表示） */}
      {!filtering && tipRate && <TipRateIndicator stats={tipRate} />}

      <h1 className="mb-6 text-2xl font-bold">記事一覧</h1>

      {/* 検索 */}
      <form action="/" method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="記事を検索"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          検索
        </button>
      </form>

      {/* フィード切り替え（すべて／フォロー中｜フォロー中ユーザー）。タグ行の直上に配置。 */}
      <FeedChips
        show={!!me}
        activeFeed="all"
        allHref={buildQuery({ q, tag })}
        followingUsers={followingUsers}
        latestFollowingPostAt={latestFollowingPostAt}
      />

      {/* タグナビ */}
      {topTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">タグ:</span>
          {topTags.map(([t, c]) => (
            <Link
              key={t}
              href={buildQuery({ tag: t, q })}
              className={`rounded-full px-3 py-1 text-xs transition ${
                t === tag
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              #{t} ({c})
            </Link>
          ))}
        </div>
      )}

      {/* 絞り込み中の表示 */}
      {filtering && (
        <p className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {tag && `タグ「${tag}」`}
            {tag && q && " / "}
            {q && `「${q}」の検索結果`}: {total} 件
          </span>
          <Link href="/" className="underline">
            すべて表示
          </Link>
        </p>
      )}

      {/* トップのハイライト（投げ銭ティッカー/ランキング/注目）。絞り込み中は非表示。 */}
      {!filtering && highlights && <HomeHighlights data={highlights} />}

      {!filtering && (
        <h2 id="latest-articles" className="mb-4 scroll-mt-4 text-lg font-bold">
          新着記事
        </h2>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filtering
            ? "条件に一致する記事がありません。"
            : "まだ公開記事がありません。"}
        </p>
      ) : (
        <PostFeed
          key={`${q}|${tag}`}
          initialPosts={posts}
          initialHasMore={hasMore}
          q={q}
          tag={tag}
        />
      )}
    </main>
  );
}
