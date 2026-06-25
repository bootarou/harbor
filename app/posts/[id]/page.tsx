import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { AuthorCard } from "@/components/author-card";
import { CommentForm } from "@/components/comment-form";
import { TipBox } from "@/components/tip/tip-box";
import { TipperAvatars, type TipperInfo } from "@/components/tip/tipper-avatars";
import { AnswerForm } from "@/components/qa/answer-form";
import { PollBox } from "@/components/poll/poll-box";
import { selectBestAnswer } from "@/app/answers/actions";
import { PurchasePanel } from "@/components/purchase-panel";
import { ReactionBar } from "@/components/reaction-bar";
import { BookmarkButton } from "@/components/bookmark-button";
import { ShareButtons } from "@/components/share-buttons";
import { ViewTracker } from "@/components/view-tracker";
import { deleteComment } from "@/app/comments/actions";
import { htmlToText } from "@/lib/sanitize";
import { renderLinkCardsHtml } from "@/lib/link-preview";
import { formatXym } from "@/lib/format";
import { tipStatus } from "@/lib/tips/status";
import { youtubeEmbedId, youtubeEmbedUrl } from "@/lib/youtube";
import { absoluteUrl } from "@/lib/site";

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
  // X/Twitter 等の外部クローラーが取得できるよう、必ず公開ドメインの絶対URLにする。
  const rawImage =
    (isExternal ? post.ogpImageUrl : post.coverImage) || "/og-default.png";
  const images = [absoluteUrl(rawImage)];
  const url = absoluteUrl(`/posts/${id}`);

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
    timeZone: "Asia/Tokyo",
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
      qaStatus: true,
      pollClosesAt: true,
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
        // 記事への投げ銭のみ（回答への投げ銭 answerId!=null は各回答カードで表示）。
        where: { answerId: null },
        orderBy: { confirmedAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          anonymous: true,
          confirmed: true,
          confirmedAt: true,
          createdAt: true,
          fromAddress: true,
          fromUser: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!post) {
    notFound();
  }

  const [tipAgg, firstTipperRows] = await Promise.all([
    prisma.tip.aggregate({
      where: { postId: post.id, answerId: null },
      _sum: { amount: true },
      _count: true,
    }),
    // 先着1番目（最も早く確定した投げ銭）の Tipper。見出し横の 👑 アイコンと一覧の目印に使う。
    prisma.tip.findMany({
      where: { postId: post.id, answerId: null, confirmed: true },
      orderBy: { confirmedAt: "asc" },
      take: 1,
      select: {
        id: true,
        fromUserId: true,
        anonymous: true,
        fromUser: { select: { avatarUrl: true, displayName: true } },
      },
    }),
  ]);
  const tipTotal = tipAgg._sum.amount ? Number(tipAgg._sum.amount) : 0;
  const tipCount = tipAgg._count;
  const firstTippers: TipperInfo[] = firstTipperRows.map((t, i) => ({
    userId: t.fromUserId,
    avatarUrl: t.anonymous ? null : t.fromUser?.avatarUrl ?? null,
    displayName: t.anonymous ? null : t.fromUser?.displayName ?? null,
    anonymous: t.anonymous,
    isFirst: i === 0,
  }));
  // 先着1番目（最も早く確定した投げ銭）の Tip id。一覧で 👑 を付ける目印。
  const firstTipId = firstTipperRows[0]?.id ?? null;

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
  // 本文中の <a data-card> をキャッシュからリンクカードHTMLへ置換（保存済み・サニタイズ済み）。
  const [contentHtmlRendered, paidHtmlRendered] = await Promise.all([
    renderLinkCardsHtml(post.contentHTML),
    post.paidHtml ? renderLinkCardsHtml(post.paidHtml) : Promise.resolve(""),
  ]);
  const isUrl = post.postType === "external_url";
  const tipAllowed = !isUrl || post.tipsEnabled;
  const ytId = isUrl ? youtubeEmbedId(post.url) : null;

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

  // ログインユーザーのブックマーク状態
  const isBookmarked = currentUserId
    ? (await prisma.bookmark.findUnique({
        where: { userId_postId: { userId: currentUserId, postId: post.id } },
        select: { id: true },
      })) !== null
    : false;

  // ===== アンケート（任意・全投稿タイプ） =====
  const pollOptions = await prisma.pollOption.findMany({
    where: { postId: post.id },
    orderBy: { order: "asc" },
    select: { id: true, label: true, _count: { select: { votes: true } } },
  });
  const hasPoll = pollOptions.length >= 2;
  const pollTotalVotes = pollOptions.reduce((s, o) => s + o._count.votes, 0);
  const myPollVote =
    hasPoll && currentUserId
      ? await prisma.pollVote.findUnique({
          where: { postId_userId: { postId: post.id, userId: currentUserId } },
          select: { optionId: true },
        })
      : null;

  // ===== QA（質問・回答） =====
  const isQa = post.postType === "qa";
  // 回答一覧（ベストアンサーを最上部に固定 → 以降は投稿日時昇順）。
  const answers = isQa
    ? await prisma.answer.findMany({
        where: { postId: post.id },
        orderBy: [{ isBest: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          contentHTML: true,
          isBest: true,
          createdAt: true,
          authorId: true,
          author: {
            select: { id: true, displayName: true, avatarUrl: true, xymAddress: true },
          },
        },
      })
    : [];
  // 各回答の投げ銭合計（確定/未確定問わず記録ベース）。
  const answerTipRows =
    answers.length > 0
      ? await prisma.tip.groupBy({
          by: ["answerId"],
          where: { answerId: { in: answers.map((a) => a.id) } },
          _sum: { amount: true },
          _count: true,
        })
      : [];
  const answerTipByid = new Map(
    answerTipRows.map((r) => [
      r.answerId as string,
      { total: r._sum.amount ? Number(r._sum.amount) : 0, count: r._count },
    ])
  );
  // 回答本文中のリンクカードをキャッシュからカードHTMLへ置換（保存済み・サニタイズ済み）。
  const answerHtmlById = new Map(
    await Promise.all(
      answers.map(
        async (a) =>
          [a.id, await renderLinkCardsHtml(a.contentHTML)] as const
      )
    )
  );

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
          {isQa && (
            <>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                Q&amp;A
              </span>
              {post.qaStatus === "answered" ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
                  解決済み
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  未回答
                </span>
              )}
            </>
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
          {currentUserId && (
            <BookmarkButton postId={post.id} isBookmarked={isBookmarked} />
          )}
        </p>

        <div className="mt-3">
          <ShareButtons
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/posts/${post.id}`}
            title={post.title}
          />
        </div>

        {isUrl ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {post.author.displayName} さんが外部コンテンツを共有しました
            </p>
            {post.comment && (
              <p className="whitespace-pre-wrap text-sm">{post.comment}</p>
            )}
            {ytId ? (
              <div className="flex flex-col gap-2">
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    src={youtubeEmbedUrl(ytId)}
                    title={post.ogpTitle || "YouTube video"}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                {post.url && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="self-start text-xs text-gray-500 underline dark:text-gray-400"
                  >
                    YouTube で開く
                  </a>
                )}
              </div>
            ) : (
              post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block overflow-hidden rounded-lg border border-gray-200 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                >
                  {post.ogpImageUrl && (
                    <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.ogpImageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
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
              )
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
              dangerouslySetInnerHTML={{ __html: contentHtmlRendered }}
            />

            {post.paid && canReadPaid && post.paidHtml && (
              <div
                className="prose prose-sm dark:prose-invert mt-2 max-w-none"
                dangerouslySetInnerHTML={{ __html: paidHtmlRendered }}
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

      {hasPoll && (
        <PollBox
          postId={post.id}
          options={pollOptions.map((o) => ({
            id: o.id,
            label: o.label,
            count: o._count.votes,
          }))}
          totalVotes={pollTotalVotes}
          myOptionId={myPollVote?.optionId ?? null}
          closesAt={post.pollClosesAt}
          closed={
            post.pollClosesAt !== null &&
            post.pollClosesAt.getTime() <= nowMs
          }
          isLoggedIn={currentUserId !== null}
          isAuthor={isAuthor}
        />
      )}

      {isQa && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">回答（{answers.length}）</h2>

          <ul className="mb-8 flex flex-col gap-4">
            {answers.map((answer) => {
              const tip = answerTipByid.get(answer.id);
              const canSelectBest =
                isAuthor && currentUserId !== null && !answer.isBest;
              return (
                <li
                  key={answer.id}
                  className={`rounded-lg border p-4 ${
                    answer.isBest
                      ? "border-green-300 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={answer.author.avatarUrl || "/avatar-placeholder.svg"}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                      <Link
                        href={`/users/${answer.author.id}`}
                        className="font-medium hover:underline"
                      >
                        {answer.author.displayName}
                      </Link>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(answer.createdAt)}
                      </span>
                    </div>
                    {answer.isBest && (
                      <span className="shrink-0 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                        🏆 ベストアンサー
                      </span>
                    )}
                  </div>

                  <div
                    className="prose prose-sm dark:prose-invert mt-3 max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: answerHtmlById.get(answer.id) ?? "",
                    }}
                  />

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      💴 {formatXym(tip?.total ?? 0)} XYM・{tip?.count ?? 0} 件
                    </span>
                    {canSelectBest && (
                      <form action={selectBestAnswer}>
                        <input type="hidden" name="answerId" value={answer.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-green-600 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950"
                        >
                          ベストアンサーに選ぶ
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="mt-3">
                    <TipBox
                      postId={post.id}
                      answerId={answer.id}
                      recipientAddress={answer.author.xymAddress}
                      isAuthor={currentUserId === answer.authorId}
                    />
                  </div>
                </li>
              );
            })}
            {answers.length === 0 && (
              <li className="text-sm text-gray-500 dark:text-gray-400">
                まだ回答はありません。最初の回答を投稿しましょう。
              </li>
            )}
          </ul>

          <h3 className="mb-2 text-sm font-semibold">回答を投稿する</h3>
          {currentUserId ? (
            <AnswerForm postId={post.id} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              回答するには{" "}
              <Link
                href={`/login?callbackUrl=/posts/${post.id}`}
                className="underline"
              >
                ログイン
              </Link>{" "}
              してください。
            </p>
          )}
        </section>
      )}

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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              合計 {formatXym(tipTotal)} XYM・{tipCount} 件
            </span>
            {/* 見出し横は先着1番目の Tipper のみ（👑付き）を表示する。 */}
            <TipperAvatars
              tippers={firstTippers.slice(0, 1)}
              moreCount={0}
              variant="detail"
            />
          </div>
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
                  {(() => {
                    const status = tipStatus(tip);
                    const cls =
                      status === "confirmed"
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                        : status === "expired"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
                    const label =
                      status === "confirmed"
                        ? "確定"
                        : status === "expired"
                          ? "期限切れ"
                          : "確認中";
                    return (
                      <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>
                        {label}
                      </span>
                    );
                  })()}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      tip.anonymous
                        ? "/avatar-placeholder.svg"
                        : tip.fromUser?.avatarUrl || "/avatar-placeholder.svg"
                    }
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full bg-gray-100 object-cover dark:bg-gray-800"
                  />
                  <span className="flex items-center gap-1">
                    {tip.id === firstTipId && (
                      <span
                        className="text-base leading-none"
                        title="First Tipper"
                        aria-label="First Tipper"
                      >
                        👑
                      </span>
                    )}
                    {tip.anonymous
                      ? "匿名"
                      : tip.fromUser?.displayName ??
                        shortAddress(tip.fromAddress)}
                  </span>
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
