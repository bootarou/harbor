import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PostCard } from "@/components/post-card";

const PAGE_SIZE = 12;

function buildQuery(opts: { page?: number; q?: string; tag?: string }): string {
  const sp = new URLSearchParams();
  if (opts.q) sp.set("q", opts.q);
  if (opts.tag) sp.set("tag", opts.tag);
  if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = sp.q?.trim() ?? "";
  const tag = sp.tag?.trim() ?? "";

  const where: Prisma.PostWhereInput = { published: true };
  if (tag) where.tags = { has: tag };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { contentHTML: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, posts, tagRows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        contentHTML: true,
        coverImage: true,
        tags: true,
        createdAt: true,
        paid: true,
        priceAmount: true,
        priceCurrency: true,
        author: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    // タグナビ用（公開記事のタグを集計）
    prisma.post.findMany({
      where: { published: true },
      select: { tags: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 投げ銭合計の集計
  const postIds = posts.map((p) => p.id);
  const tipAgg = postIds.length
    ? await prisma.post
        .findMany({
          where: { id: { in: postIds } },
          select: { id: true, tips: { select: { amount: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            total: r.tips.reduce((s, t) => s + Number(t.amount), 0),
            count: r.tips.length,
          }))
        )
    : [];
  const tipMap = new Map(tipAgg.map((t) => [t.id, t]));

  // 上位タグ
  const tagCounts = new Map<string, number>();
  for (const r of tagRows) {
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const filtering = q !== "" || tag !== "";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
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

      {posts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filtering
            ? "条件に一致する記事がありません。"
            : "まだ公開記事がありません。"}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={{
                ...post,
                priceAmount:
                  post.priceAmount != null ? Number(post.priceAmount) : null,
              }}
              tip={tipMap.get(post.id)}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={buildQuery({ page: page - 1, q, tag })} className="underline">
              ← 前のページ
            </Link>
          ) : (
            <span className="text-gray-400">← 前のページ</span>
          )}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildQuery({ page: page + 1, q, tag })} className="underline">
              次のページ →
            </Link>
          ) : (
            <span className="text-gray-400">次のページ →</span>
          )}
        </nav>
      )}
    </main>
  );
}
