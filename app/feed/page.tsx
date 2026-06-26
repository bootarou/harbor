import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostCard } from "@/components/post-card";
import { FeedChips } from "@/components/feed-chips";
import { buildTippers, livePostWhere } from "@/lib/posts";
import { htmlToText } from "@/lib/sanitize";

export const metadata = { title: "フォロー中" };

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/feed");
  }
  const me = session.user.id;

  // フォロー中のユーザー（新しくフォローした順）。
  const follows = await prisma.follow.findMany({
    where: { followerId: me },
    orderBy: { createdAt: "desc" },
    select: {
      following: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });
  const followingUsers = follows.map((f) => f.following);
  const followingIds = followingUsers.map((u) => u.id);

  const posts = followingIds.length
    ? await prisma.post.findMany({
        where: { AND: [livePostWhere(), { authorId: { in: followingIds } }] },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          contentHTML: true,
          coverImage: true,
          tags: true,
          createdAt: true,
          viewCount: true,
          paid: true,
          priceAmount: true,
          priceCurrency: true,
          postType: true,
          qaStatus: true,
          comment: true,
          ogpTitle: true,
          ogpImageUrl: true,
          ogpSiteName: true,
          thanksCount: true,
          thanksStatus: true,
          isArchived: true,
          author: { select: { displayName: true, avatarUrl: true } },
          tips: {
            where: { answerId: null },
            orderBy: { confirmedAt: "asc" },
            select: {
              amount: true,
              confirmed: true,
              anonymous: true,
              fromUserId: true,
              fromUser: { select: { avatarUrl: true, displayName: true } },
            },
          },
        },
      })
    : [];

  if (followingIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-2 py-10 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold">フォロー中</h1>
        <FeedChips
          show
          activeFeed="following"
          allHref="/"
          followingUsers={[]}
          latestFollowingPostAt={null}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだ誰もフォローしていません。記事の著者ページからフォローできます。{" "}
          <Link href="/" className="underline">
            記事を探す
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-2 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">フォロー中</h1>
      <FeedChips
        show
        activeFeed="following"
        allHref="/"
        followingUsers={[]}
        latestFollowingPostAt={null}
      />

      {/* ユーザー（横スクロール） */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold">ユーザー</h2>
        <ul className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {followingUsers.map((u) => (
            <li key={u.id} className="shrink-0">
              <Link
                href={`/users/${u.id}`}
                className="flex w-20 flex-col items-center gap-1.5 text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u.avatarUrl || "/avatar-placeholder.svg"}
                  alt=""
                  className="h-16 w-16 rounded-full border border-gray-200 object-cover dark:border-gray-700"
                />
                <span className="line-clamp-2 text-xs text-gray-700 dark:text-gray-300">
                  {u.displayName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* フォロー中の新着 */}
      <section>
        <h2 className="mb-4 text-xl font-bold">フォロー中の新着</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            フォロー中のユーザーの公開記事はまだありません。
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {posts.map((post) => {
              const { tippers, moreCount } = buildTippers(post.tips);
              return (
                <PostCard
                  key={post.id}
                  post={{
                    ...post,
                    priceAmount:
                      post.priceAmount != null ? Number(post.priceAmount) : null,
                    excerpt:
                      post.postType === "external_url"
                        ? post.comment ?? ""
                        : htmlToText(post.contentHTML, 80),
                    tippers,
                    tipperMoreCount: moreCount,
                  }}
                  tip={{
                    total: post.tips.reduce((s, t) => s + Number(t.amount), 0),
                    count: post.tips.length,
                  }}
                />
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
