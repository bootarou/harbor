import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { livePostWhere } from "@/lib/posts";

export const metadata = {
  title: "Harbor Archive | 殿堂入り記事",
  description: "Harborに刻まれた価値ある記事（Discovery到達＝殿堂入り）の一覧。",
};

// 認証不要だが build 時の静的プリレンダ（DB必須）を避けるため都度レンダリング。
// 重いクエリはページ番号ごとに unstable_cache（5分）でキャッシュする。
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// ページ番号を引数に取ると unstable_cache がキー要素として扱う（ページごとに別キャッシュ）。
const getArchivePage = unstable_cache(
  async (pageNum: number) => {
    const where = { AND: [livePostWhere(), { isArchived: true }] };
    return Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: [
          { archivedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (pageNum - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          archivedAt: true,
          createdAt: true,
          thanksCount: true,
          author: { select: { displayName: true } },
        },
      }),
    ] as const);
  },
  ["archive-page-v1"],
  { revalidate: 300 }
);

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, posts] = await getArchivePage(pageNum);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = pageNum > 1;
  const hasNext = pageNum < totalPages;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/status" className="text-gray-500 hover:underline dark:text-gray-400">
          ← Harbor Status へ戻る
        </Link>
      </nav>

      <header className="mb-6 rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-5 dark:border-amber-700 dark:from-amber-950/40 dark:to-yellow-950/30">
        <h1 className="text-xl font-bold text-amber-800 dark:text-amber-200">
          ⚓ Harbor Archive
        </h1>
        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
          Harborに刻まれた価値ある記事（数えきれない感謝に導かれ、新しい大陸へ辿り着いた記事）
        </p>
      </header>

      {total === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだ殿堂入りした記事はありません。
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            全 {total} 件中 {(pageNum - 1) * PAGE_SIZE + 1}–
            {Math.min(pageNum * PAGE_SIZE, total)} 件
          </p>
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {posts.map((p) => (
              <li key={p.id} className="py-3">
                <Link
                  href={`/posts/${p.id}`}
                  className="flex items-start gap-2 hover:underline"
                >
                  <span aria-hidden="true" className="shrink-0 text-sm">
                    ⚓
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{p.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {p.author.displayName}・🎁 {p.thanksCount} Thanks・
                      {formatDate(p.archivedAt ?? p.createdAt)} 殿堂入り
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-between text-sm">
              {hasPrev ? (
                <Link
                  href={`/archive?page=${pageNum - 1}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  ← 前へ
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {pageNum} / {totalPages}
              </span>
              {hasNext ? (
                <Link
                  href={`/archive?page=${pageNum + 1}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  次へ →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
