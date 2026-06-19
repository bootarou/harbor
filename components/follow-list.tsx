import Link from "next/link";
import { FollowButton } from "@/components/follow-button";

export type FollowListUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  xAccount: string | null;
  bio: string | null;
  // 閲覧者がこのユーザーをフォロー済みか（未ログイン時は false）。
  isFollowing: boolean;
};

// フォロー中・フォロワー一覧で共通利用するユーザーリスト表示。
export function FollowList({
  users,
  viewerId,
  emptyText,
}: {
  users: FollowListUser[];
  viewerId?: string;
  emptyText: string;
}) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 py-3">
          <Link href={`/users/${u.id}`} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u.avatarUrl || "/avatar-placeholder.svg"}
              alt=""
              className="h-11 w-11 rounded-full object-cover"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/users/${u.id}`}
              className="font-semibold hover:underline"
            >
              {u.displayName}
            </Link>
            {u.xAccount && (
              <a
                href={`https://x.com/${u.xAccount}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                @{u.xAccount}
              </a>
            )}
            {u.bio && (
              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                {u.bio}
              </p>
            )}
          </div>
          {viewerId && viewerId !== u.id && (
            <div className="ml-auto shrink-0">
              <FollowButton targetId={u.id} isFollowing={u.isFollowing} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
