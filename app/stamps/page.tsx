import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopStamps, getOwnedStampIds } from "@/lib/stamps";
import { StampCard } from "@/components/stamp/stamp-card";

export const metadata: Metadata = {
  title: "スタンプショップ",
  description: "ユーザーが作成したスタンプを購入して記事に貼れます。",
};

export default async function StampShopPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; author?: string }>;
}) {
  const { sort, author } = await searchParams;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const sortMode = sort === "popular" ? "popular" : "new";

  const [stamps, ownedIds, authorUser] = await Promise.all([
    getShopStamps({ sort: sortMode, authorId: author }),
    getOwnedStampIds(currentUserId),
    author
      ? prisma.user.findUnique({
          where: { id: author },
          select: { displayName: true },
        })
      : Promise.resolve(null),
  ]);

  const baseQs = (next: { sort?: string; author?: string }) => {
    const qs = new URLSearchParams();
    if (next.sort && next.sort !== "new") qs.set("sort", next.sort);
    if (next.author) qs.set("author", next.author);
    const s = qs.toString();
    return s ? `/stamps?${s}` : "/stamps";
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎨 スタンプショップ</h1>
        {currentUserId && (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/stamps/my" className="underline">
              購入したスタンプ
            </Link>
            <Link href="/stamps/manage" className="underline">
              作成・管理
            </Link>
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={baseQs({ sort: "new", author })}
          className={`rounded-full border px-3 py-1 ${
            sortMode === "new"
              ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
              : "border-gray-300 dark:border-gray-700"
          }`}
        >
          新着順
        </Link>
        <Link
          href={baseQs({ sort: "popular", author })}
          className={`rounded-full border px-3 py-1 ${
            sortMode === "popular"
              ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
              : "border-gray-300 dark:border-gray-700"
          }`}
        >
          人気順
        </Link>
        {author && (
          <span className="ml-2 flex items-center gap-2 text-gray-600 dark:text-gray-400">
            作者: {authorUser?.displayName ?? "（不明）"}
            <Link href={baseQs({ sort: sortMode })} className="underline">
              解除
            </Link>
          </span>
        )}
      </div>

      {stamps.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          公開中のスタンプはまだありません。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {stamps.map((s) => (
            <StampCard
              key={s.id}
              stamp={s}
              currentUserId={currentUserId}
              owned={ownedIds.has(s.id)}
              imgSize={120}
            />
          ))}
        </div>
      )}
    </main>
  );
}
