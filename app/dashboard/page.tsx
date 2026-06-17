import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deletePost, togglePublish } from "@/app/posts/actions";

export const metadata = {
  title: "マイ記事",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const posts = await prisma.post.findMany({
    where: { authorId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      published: true,
      publishAt: true,
      updatedAt: true,
      viewCount: true,
    },
  });
  // eslint-disable-next-line react-hooks/purity -- サーバーコンポーネントでのリクエスト時刻
  const now = Date.now();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">マイ記事</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="underline">
            トップ
          </Link>
          <Link href="/revenue" className="underline">
            収益管理
          </Link>
          <Link
            href="/posts/new"
            className="rounded-md bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
          >
            新規作成
          </Link>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">記事一覧</h2>
      {posts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだ記事がありません。「新規作成」から書いてみましょう。
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{post.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const scheduled =
                      post.published &&
                      post.publishAt !== null &&
                      post.publishAt.getTime() > now;
                    if (!post.published) {
                      return (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          下書き
                        </span>
                      );
                    }
                    if (scheduled) {
                      return (
                        <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                          予約（{formatDate(post.publishAt!)} 公開）
                        </span>
                      );
                    }
                    return (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800 dark:bg-green-900 dark:text-green-200">
                        公開中
                      </span>
                    );
                  })()}
                  更新: {formatDate(post.updatedAt)}・👁 {post.viewCount}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <Link
                  href={`/posts/${post.id}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  表示
                </Link>
                <Link
                  href={`/posts/${post.id}/edit`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  編集
                </Link>
                <form action={togglePublish}>
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
                  >
                    {post.published ? "下書きに戻す" : "公開する"}
                  </button>
                </form>
                <form action={deletePost}>
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    削除
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
