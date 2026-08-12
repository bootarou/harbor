import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "購入したスタンプ" };

export default async function MyStampsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/stamps/my");
  }

  const purchases = await prisma.stampPurchase.findMany({
    where: { buyerId: session.user.id },
    orderBy: { purchasedAt: "desc" },
    select: {
      id: true,
      purchasedAt: true,
      stamp: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          author: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">購入したスタンプ</h1>
        <Link href="/stamps" className="text-sm underline">
          ショップへ
        </Link>
      </div>

      {purchases.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだスタンプを購入していません。
          <Link href="/stamps" className="ml-1 underline">
            スタンプを探す →
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {purchases.map((p) => (
            <div
              key={p.id}
              className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.stamp.imageUrl}
                alt={p.stamp.name}
                style={{ width: 80, height: 80 }}
                className="rounded-md bg-gray-50 object-contain dark:bg-gray-900"
              />
              <p className="w-full truncate text-xs font-medium" title={p.stamp.name}>
                {p.stamp.name}
              </p>
              <Link
                href={`/users/${p.stamp.author.id}`}
                className="w-full truncate text-[11px] text-gray-500 hover:underline dark:text-gray-400"
              >
                {p.stamp.author.displayName ?? "（無名）"}
              </Link>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-gray-400">
        購入したスタンプは記事の「🎨 スタンプ」ボタンから貼り付けられます。
      </p>
    </main>
  );
}
