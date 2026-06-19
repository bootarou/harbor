import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { livePostWhere } from "@/lib/posts";
import { FollowButton } from "@/components/follow-button";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(d);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { displayName: true },
  });
  return { title: user ? user.displayName : "ユーザー" };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, user] = await Promise.all([
    auth(),
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        xAccount: true,
        xymAddress: true,
        tokushoho: true,
        salesTerms: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
        posts: {
          where: livePostWhere(),
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, createdAt: true },
        },
      },
    }),
  ]);

  if (!user) {
    notFound();
  }

  const isMe = session?.user?.id === user.id;
  const isFollowing =
    session?.user?.id && !isMe
      ? (await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: session.user.id,
              followingId: user.id,
            },
          },
          select: { id: true },
        })) !== null
      : false;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-gray-500 hover:underline dark:text-gray-400">
          ← 記事一覧へ戻る
        </Link>
      </nav>

      <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl || "/avatar-placeholder.svg"}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{user.displayName}</h1>
            {user.xAccount && (
              <a
                href={`https://x.com/${user.xAccount}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                @{user.xAccount}
              </a>
            )}
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatDate(user.createdAt)} に参加
            </p>
            <p className="mt-1 flex gap-4 text-xs text-gray-600 dark:text-gray-400">
              <Link
                href={`/users/${user.id}/following`}
                className="hover:underline"
              >
                <span className="font-semibold">{user._count.following}</span>{" "}
                フォロー中
              </Link>
              <Link
                href={`/users/${user.id}/followers`}
                className="hover:underline"
              >
                <span className="font-semibold">{user._count.followers}</span>{" "}
                フォロワー
              </Link>
            </p>
          </div>
          <div className="ml-auto">
            {isMe ? (
              <Link
                href="/profile"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
              >
                編集
              </Link>
            ) : session?.user?.id ? (
              <FollowButton targetId={user.id} isFollowing={isFollowing} />
            ) : null}
          </div>
        </div>

        {user.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
            {user.bio}
          </p>
        )}

        {user.xymAddress && (
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              XYM アドレス
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              {user.xymAddress}
            </p>
          </div>
        )}
      </section>

      {(user.tokushoho || user.salesTerms) && (
        <section className="mt-8 flex flex-col gap-4">
          {user.tokushoho && (
            <details className="group rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>📜 特定商取引法に基づく表記</span>
                <span
                  className="text-gray-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {user.tokushoho}
              </p>
            </details>
          )}
          {user.salesTerms && (
            <details className="group rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>利用規約・販売条件</span>
                <span
                  className="text-gray-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {user.salesTerms}
              </p>
            </details>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">
          公開記事（{user.posts.length}）
        </h2>
        {user.posts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            まだ公開記事がありません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {user.posts.map((post) => (
              <li key={post.id} className="py-3">
                <Link
                  href={`/posts/${post.id}`}
                  className="font-medium hover:underline"
                >
                  {post.title}
                </Link>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(post.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
