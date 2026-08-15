import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatXym } from "@/lib/format";
import { toggleStampPublish } from "@/app/stamps/actions";
import { DeleteStampButton } from "@/components/stamp/delete-stamp-button";

export const metadata: Metadata = { title: "スタンプ管理" };

export default async function StampManagePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/stamps/manage");
  }

  const stamps = await prisma.stamp.findMany({
    where: { authorId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      price: true,
      published: true,
      _count: { select: { purchases: true, placements: true, communityMessages: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">スタンプ管理</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/stamps" className="underline">
            ショップ
          </Link>
          <Link
            href="/stamps/new"
            className="rounded-md bg-black px-3 py-1.5 font-medium text-white dark:bg-white dark:text-black"
          >
            ＋ 作成
          </Link>
        </div>
      </div>

      {stamps.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだスタンプがありません。「＋ 作成」から追加できます。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {stamps.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.imageUrl}
                alt={s.name}
                className="h-16 w-16 shrink-0 rounded-md border border-gray-100 bg-gray-50 object-contain dark:border-gray-800 dark:bg-gray-900"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {formatXym(Number(s.price))} XYM・
                  {s.published ? "公開中" : "非公開"}・購入 {s._count.purchases}・
                  使用 {s._count.placements + s._count.communityMessages}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <Link
                  href={`/stamps/${s.id}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  共有ページ
                </Link>
                <Link
                  href={`/stamps/${s.id}/edit`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  編集
                </Link>
                <form action={toggleStampPublish}>
                  <input type="hidden" name="stampId" value={s.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {s.published ? "非公開にする" : "公開する"}
                  </button>
                </form>
                <DeleteStampButton
                  stampId={s.id}
                  name={s.name}
                  disabled={s._count.purchases > 0}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
