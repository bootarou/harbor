import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostCard } from "@/components/post-card";
import { livePostWhere } from "@/lib/posts";

export const metadata = { title: "フォロー中" };

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/feed");
  }
  const me = session.user.id;

  const following = await prisma.follow.findMany({
    where: { followerId: me },
    select: { followingId: true },
  });
  const followingIds = following.map((f) => f.followingId);

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
          comment: true,
          ogpTitle: true,
          ogpImageUrl: true,
          ogpSiteName: true,
          author: { select: { displayName: true, avatarUrl: true } },
          tips: { select: { amount: true } },
        },
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">フォロー中の新着</h1>

      {followingIds.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだ誰もフォローしていません。記事の著者ページからフォローできます。{" "}
          <Link href="/" className="underline">
            記事を探す
          </Link>
        </p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          フォロー中のユーザーの公開記事はまだありません。
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={{
                ...post,
                priceAmount:
                  post.priceAmount != null ? Number(post.priceAmount) : null,
              }}
              tip={{
                total: post.tips.reduce((s, t) => s + Number(t.amount), 0),
                count: post.tips.length,
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
