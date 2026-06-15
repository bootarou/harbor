import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { AuthorCard } from "@/components/author-card";
import { CommentForm } from "@/components/comment-form";
import { TipBox } from "@/components/tip/tip-box";
import { PurchasePanel } from "@/components/purchase-panel";
import { ReactionBar } from "@/components/reaction-bar";
import { ViewTracker } from "@/components/view-tracker";
import { deleteComment } from "@/app/comments/actions";
import { htmlToText } from "@/lib/sanitize";
import { formatXym } from "@/lib/format";

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      title: true,
      contentHTML: true,
      coverImage: true,
      published: true,
      publishAt: true,
      postType: true,
      comment: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
    },
  });
  // 未公開・予約（公開日時が未来）の記事はメタ情報を出さない（本文抜粋の漏えい防止）。
  const isLive =
    post?.published &&
    (!post.publishAt || post.publishAt.getTime() <= Date.now());
  if (!post || !isLive) {
    return { title: "記事" };
  }

  // 外部URL共有投稿は OGP フィールド（取得済み）を、通常記事は本文/カバー画像を使う。
  const isExternal = post.postType === "external_url";
  const title = (isExternal ? post.ogpTitle || post.title : post.title) || "記事";
  const description = isExternal
    ? post.comment?.trim() ||
      post.ogpDescription?.trim() ||
      "外部コンテンツの紹介"
    : htmlToText(post.contentHTML, 120);
  // 画像が無い記事はサイト共通のフォールバック OG 画像を使う。
  const image = (isExternal ? post.ogpImageUrl : post.coverImage) || "/og-default.png";
  const images = [image];
  const url = `/posts/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      contentHTML: true,
      coverImage: true,
      published: true,
      tags: true,
      createdAt: true,
      publishAt: true,
      postType: true,
      url: true,
      comment: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      ogpSiteName: true,
      tipsEnabled: true,
      viewCount: true,
      paid: true,
      paidHtml: true,
      priceAmount: true,
      priceCurrency: true,
      sellerAddress: true,
      authorId: true,
      author: {
        select: {
          displayName: true,
          avatarUrl: true,
          bio: true,
          xAccount: true,
          xymAddress: true,
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          userId: true,
          user: { select: { displayName: true, avatarUrl: true } },
        },
      },
      tips: {
        orderBy: { confirmedAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          anonymous: true,
          confirmed: true,
          confirmedAt: true,
          fromAddress: true,
          fromUser: { select: { displayName: true } },
        },
      },
    },
  });

  if (!post) {
    notFound();
  }

  const tipAgg = await prisma.tip.aggregate({
    where: { postId: post.id },
    _sum: { amount: true },
    _count: true,
  });
  const tipTotal = tipAgg._sum.amount ? Number(tipAgg._sum.amount) : 0;
  const tipCount = tipAgg._count;

  const isAuthor = currentUserId === post.authorId;
  // 非公開記事は著者本人のみ閲覧可。
  if (!post.published && !isAuthor) {
    notFound();
  }
  // 公開日時が未来の記事は著者本人以外には非表示。
  // eslint-disable-next-line react-hooks/purity -- サーバーコンポーネントでのリクエスト時刻判定
  const nowMs = Date.now();
  if (post.publishAt && post.publishAt.getTime() > nowMs && !isAuthor) {
    notFound();
  }

  // 有料記事の閲覧権: 著者本人、または購入済みユーザー。
  let hasPurchased = false;
  if (post.paid && currentUserId && !isAuthor) {
    const purchase = await prisma.purchase.findFirst({
      where: { postId: post.id, buyerUserId: currentUserId },
      select: { id: true },
    });
    hasPurchased = purchase !== null;
  }
  const canReadPaid = !post.paid || isAuthor || hasPurchased;
  const isUrl = post.postType === "external_url";
  const tipAllowed = !isUrl || post.tipsEnabled;

  // リアクション集計と、ログインユーザー自身のリアクション
  const [reactionGroups, myReactions] = await Promise.all([
    prisma.reaction.groupBy({
      by: ["type"],
      where: { postId: post.id },
      _count: true,
    }),
    currentUserId
      ? prisma.reaction.findMany({
          where: { postId: post.id, userId: currentUserId },
          select: { type: true },
        })
      : Promise.resolve([]),
  ]);
  const reactionCounts: Record<string, number> = {};
  for (const g of reactionGroups) reactionCounts[g.type] = g._count;
  const myReactionKeys = myReactions.map((r) => r.type);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <ViewTracker postId={post.id} />
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-gray-500 hover:underline dark:text-gray-400">
          ← 記事一覧へ戻る
        </Link>
      </nav>

      <article>
        {!post.published && (
          <p className="mb-4 inline-block rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            下書き（あなただけに表示されています）
          </p>
        )}

        <h1 className="text-3xl font-bold">{post.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          {post.paid && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
              有料 {post.priceAmount ? formatXym(Number(post.priceAmount)) : ""}{" "}
              {post.priceCurrency ?? "XYM"}
            </span>
          )}
          {post.author.displayName}・{formatDate(post.createdAt)}
          <span className="text-gray-400">👁 {post.viewCount}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            💴 {formatXym(tipTotal)} XYM・{tipCount}件
          </span>
          {isAuthor && (
            <Link href={`/posts/${post.id}/edit`} className="underline">
              編集
            </Link>
          )}
        </p>

        {isUrl ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {post.author.displayName} さんが外部コンテンツを共有しました
            </p>
            {post.comment && (
              <p className="whitespace-pre-wrap text-sm">{post.comment}</p>
            )}
            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block overflow-hidden rounded-lg border border-gray-200 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
              >
                {post.ogpImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.ogpImageUrl} alt="" className="max-h-72 w-full object-cover" />
                )}
                <div className="p-3">
                  <p className="font-semibold">{post.ogpTitle || post.url}</p>
                  {post.ogpDescription && (
                    <p className="mt-1 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
                      {post.ogpDescription}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {post.ogpSiteName || post.url}
                  </p>
                </div>
              </a>
            )}
          </div>
        ) : (
          <>
            {post.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.coverImage}
                alt=""
                className="mt-6 max-h-96 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="mt-6 flex h-48 w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                <span className="select-none text-5xl font-bold tracking-widest text-gray-300 dark:text-gray-700">
                  Harbor
                </span>
              </div>
            )}

            {/* 無料部分（販売記事では試し読み）。保存時に sanitize 済み。 */}
            <div
              className="prose prose-sm dark:prose-invert mt-8 max-w-none"
              dangerouslySetInnerHTML={{ __html: post.contentHTML }}
            />

            {post.paid && canReadPaid && post.paidHtml && (
              <div
                className="prose prose-sm dark:prose-invert mt-2 max-w-none"
                dangerouslySetInnerHTML={{ __html: post.paidHtml }}
              />
            )}

            {post.paid && canReadPaid && !isAuthor && (
              <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
                ✓ 購入済み（全文を表示しています）
              </p>
            )}

            {post.paid && !canReadPaid && post.sellerAddress && post.priceAmount && (
              <div className="mt-6">
                <PurchasePanel
                  postId={post.id}
                  title={post.title}
                  authorName={post.author.displayName}
                  sellerAddress={post.sellerAddress}
                  priceAmount={Number(post.priceAmount)}
                  priceCurrency={post.priceCurrency ?? "XYM"}
                />
              </div>
            )}
          </>
        )}

        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </article>

      <section className="mt-10">
        <ReactionBar
          postId={post.id}
          counts={reactionCounts}
          mine={myReactionKeys}
          isLoggedIn={currentUserId !== null}
        />
      </section>

      {tipAllowed && (
      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isUrl ? "投げ銭（紹介・キュレーションへの価値送信）" : "投げ銭"}
          </h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            💴 合計 {formatXym(tipTotal)} XYM・{tipCount} 件
          </span>
        </div>

        <TipBox
          postId={post.id}
          recipientAddress={post.author.xymAddress}
          isAuthor={isAuthor}
        />

        {post.tips.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {post.tips.map((tip) => (
              <li
                key={tip.id}
                className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm dark:border-gray-800"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      tip.confirmed
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {tip.confirmed ? "確定" : "確認中"}
                  </span>
                  {tip.anonymous
                    ? "匿名"
                    : tip.fromUser?.displayName ??
                      shortAddress(tip.fromAddress)}
                </span>
                <span className="font-semibold">{formatXym(Number(tip.amount))} XYM</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <section className="mt-12">
        <h2 className="mb-4 text-sm font-semibold">著者について</h2>
        <AuthorCard author={post.author} userId={post.authorId} />
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">
          コメント（{post.comments.length}）
        </h2>

        <ul className="mb-6 flex flex-col gap-4">
          {post.comments.map((comment) => {
            const canDelete =
              currentUserId === comment.userId || isAuthor;
            return (
              <li
                key={comment.id}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={comment.user.avatarUrl || "/avatar-placeholder.svg"}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span className="font-medium">
                      {comment.user.displayName}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  {canDelete && (
                    <form action={deleteComment}>
                      <input
                        type="hidden"
                        name="commentId"
                        value={comment.id}
                      />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        削除
                      </button>
                    </form>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {comment.body}
                </p>
              </li>
            );
          })}
          {post.comments.length === 0 && (
            <li className="text-sm text-gray-500 dark:text-gray-400">
              まだコメントはありません。
            </li>
          )}
        </ul>

        {currentUserId ? (
          <CommentForm postId={post.id} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            コメントするには{" "}
            <Link href={`/login?callbackUrl=/posts/${post.id}`} className="underline">
              ログイン
            </Link>{" "}
            してください。
          </p>
        )}
      </section>
    </main>
  );
}
