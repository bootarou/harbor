import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostCard } from "@/components/post-card";
import { htmlToText } from "@/lib/sanitize";

export const metadata = { title: "ブックマーク" };

export default async function BookmarksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/bookmarks");
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      post: {
        select: {
          id: true,
          title: true,
          contentHTML: true,
          coverImage: true,
          tags: true,
          createdAt: true,
          viewCount: true,
          published: true,
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
          tips: { where: { answerId: null }, select: { amount: true } },
        },
      },
    },
  });

  // 非公開化された記事はブックマーク一覧では除外する。
  const posts = bookmarks.map((b) => b.post).filter((p) => p.published);

  return (
    <main className="mx-auto w-full max-w-6xl px-2 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">ブックマーク</h1>

      {posts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだブックマークがありません。記事ページの「ブックマーク」から保存できます。{" "}
          <Link href="/" className="underline">
            記事を探す
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
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
