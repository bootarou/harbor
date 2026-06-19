import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FollowList, type FollowListUser } from "@/components/follow-list";

// フォロー中（following）とフォロワー（followers）の一覧ページを共通化する。
// - following: 対象ユーザーがフォローしている相手
// - followers: 対象ユーザーをフォローしている相手
export async function FollowListPage({
  userId,
  mode,
}: {
  userId: string;
  mode: "following" | "followers";
}) {
  const [session, user] = await Promise.all([
    auth(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true },
    }),
  ]);

  if (!user) {
    notFound();
  }

  const userSelect = {
    id: true,
    displayName: true,
    avatarUrl: true,
    xAccount: true,
    bio: true,
  } as const;

  // following は relation "following" 側、followers は "follower" 側を取り出す。
  const listed =
    mode === "following"
      ? (
          await prisma.follow.findMany({
            where: { followerId: userId },
            orderBy: { createdAt: "desc" },
            select: { following: { select: userSelect } },
          })
        ).map((r) => r.following)
      : (
          await prisma.follow.findMany({
            where: { followingId: userId },
            orderBy: { createdAt: "desc" },
            select: { follower: { select: userSelect } },
          })
        ).map((r) => r.follower);

  // 閲覧者がリスト内の各ユーザーをフォロー済みかを一括取得。
  const viewerId = session?.user?.id;
  let followingSet = new Set<string>();
  if (viewerId && listed.length > 0) {
    const mine = await prisma.follow.findMany({
      where: {
        followerId: viewerId,
        followingId: { in: listed.map((u) => u.id) },
      },
      select: { followingId: true },
    });
    followingSet = new Set(mine.map((m) => m.followingId));
  }

  const users: FollowListUser[] = listed.map((u) => ({
    ...u,
    isFollowing: followingSet.has(u.id),
  }));

  const title = mode === "following" ? "フォロー中" : "フォロワー";
  const emptyText =
    mode === "following"
      ? "まだ誰もフォローしていません。"
      : "まだフォロワーがいません。";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/users/${user.id}`}
          className="text-gray-500 hover:underline dark:text-gray-400"
        >
          ← {user.displayName} のプロフィールへ戻る
        </Link>
      </nav>

      <h1 className="mb-4 text-xl font-bold">
        {user.displayName} の{title}
      </h1>

      <FollowList users={users} viewerId={viewerId} emptyText={emptyText} />
    </main>
  );
}
