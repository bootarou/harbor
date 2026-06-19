import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
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
        websiteUrl: true,
        symbolNamespace: true,
        smdSyncedAt: true,
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

  // 統計サマリーの集計（すべてサーバー側で Prisma 集計）。
  const [tipReceived, likeCount, viewAgg, purchaseAgg, recentSentTips] =
    await Promise.all([
      // 投げ銭受け取り累計: 確定済みで toAddress=本人の受取アドレス。
      prisma.tip.aggregate({
        _sum: { amount: true },
        where: { confirmed: true, toAddress: user.xymAddress ?? "" },
      }),
      // 総いいね数: 本人の記事に付いた like リアクション。
      prisma.reaction.count({
        where: { type: "like", post: { authorId: user.id } },
      }),
      // 総閲覧数: 本人の記事の viewCount 合計。
      prisma.post.aggregate({
        _sum: { viewCount: true },
        where: { authorId: user.id },
      }),
      // 有料記事販売実績: 確定済み購入の件数と合計金額（本人の記事）。
      prisma.purchase.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { confirmed: true, post: { authorId: user.id } },
      }),
      // 最近投げ銭した記事（本人閲覧時のみ）: fromAddress=本人の受取アドレス。
      isMe && user.xymAddress
        ? prisma.tip.findMany({
            where: { fromAddress: user.xymAddress },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              amount: true,
              createdAt: true,
              post: {
                select: {
                  id: true,
                  title: true,
                  author: { select: { id: true, displayName: true } },
                },
              },
            },
          })
        : Promise.resolve(
            [] as {
              id: string;
              amount: Prisma.Decimal;
              createdAt: Date;
              post: {
                id: string;
                title: string;
                author: { id: string; displayName: string };
              };
            }[]
          ),
    ]);

  // Decimal → 2桁固定の XYM 表記。
  const xym2 = (d: Prisma.Decimal | null): string =>
    (d ? d.toNumber() : 0).toFixed(2);

  const tipReceivedXym = xym2(tipReceived._sum.amount);
  const totalViews = viewAgg._sum.viewCount ?? 0;
  const salesCount = purchaseAgg._count;
  const salesXym = xym2(purchaseAgg._sum.amount);

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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{user.displayName}</h1>
              {user.symbolNamespace && (
                <span
                  title={
                    user.smdSyncedAt ? "Symbol Metadata認証済み" : undefined
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.smdSyncedAt
                      ? "text-white"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                  style={
                    user.smdSyncedAt
                      ? { backgroundColor: "#02c39a" }
                      : undefined
                  }
                >
                  ✓ {user.symbolNamespace}
                </span>
              )}
            </div>
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
            {user.websiteUrl && (
              <a
                href={user.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-0.5 flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M11 3a1 1 0 1 0 0 2h2.586l-6.293 6.293a1 1 0 1 0 1.414 1.414L15 6.414V9a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-5Z" />
                  <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H5V7h3a1 1 0 0 0 0-2H5Z" />
                </svg>
                <span className="truncate">
                  {user.websiteUrl.replace(/^https?:\/\//, "")}
                </span>
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

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "投げ銭受取累計", value: `${tipReceivedXym} XYM` },
          { label: "総いいね数", value: `${likeCount}` },
          { label: "総閲覧数", value: `${totalViews.toLocaleString("ja-JP")}` },
          {
            label: "有料記事販売",
            value: `${salesCount}件`,
            sub: `${salesXym} XYM`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {s.label}
            </p>
            <p className="mt-1 truncate text-base font-semibold">{s.value}</p>
            {s.sub && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {s.sub}
              </p>
            )}
          </div>
        ))}
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

      {/* 本人が自分のプロフィールを見たときのみ「最近投げ銭した記事」を表示 */}
      {isMe && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">最近投げ銭した記事</h2>
          {recentSentTips.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              まだ投げ銭した記事がありません。
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
              {recentSentTips.map((tip) => (
                <li
                  key={tip.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/posts/${tip.post.id}`}
                      className="font-medium hover:underline"
                    >
                      {tip.post.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <Link
                        href={`/users/${tip.post.author.id}`}
                        className="hover:underline"
                      >
                        {tip.post.author.displayName}
                      </Link>
                      {" ・ "}
                      {formatDate(tip.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {tip.amount.toNumber().toFixed(2)} XYM
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
