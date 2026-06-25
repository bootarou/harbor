"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SEEN_KEY = "nagexym.feedSeenAt";

export type FollowingUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

// 既存のタグチップと同じスタイル（rounded-full / px-3 py-1 / text-xs）。
const CHIP_BASE = "shrink-0 rounded-full px-3 py-1 text-xs transition";
const CHIP_INACTIVE =
  "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700";
const CHIP_ACTIVE = "bg-teal-600 text-white";

// トップページのフィード切り替え（チップ）。
// 「すべて」「フォロー中」｜ フォロー中ユーザー（アイコン＋名前）を1行に並べる。
// - 未ログイン時は何も表示しない。
// - 選択中フィードはティール背景、未選択はタグチップと同じスタイル。
// - フォロー中チップには、前回確認時刻（localStorage）以降の新着があれば●バッジ。
export function FeedChips({
  show,
  activeFeed,
  allHref,
  followingUsers,
  latestFollowingPostAt,
}: {
  show: boolean;
  activeFeed: "all" | "following";
  allHref: string;
  followingUsers: FollowingUser[];
  latestFollowingPostAt: string | null;
}) {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (activeFeed === "following") {
      // フォロー中フィードを開いたら最終確認時刻を更新してバッジを消す。
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
      setHasNew(false);
      return;
    }
    if (!latestFollowingPostAt) {
      setHasNew(false);
      return;
    }
    const seen = localStorage.getItem(SEEN_KEY);
    const latest = new Date(latestFollowingPostAt).getTime();
    setHasNew(!seen || latest > new Date(seen).getTime());
  }, [show, activeFeed, latestFollowingPostAt]);

  if (!show) return null;

  return (
    <div className="mt-3 mb-6 flex items-center gap-2 overflow-x-auto pb-1">
      <Link
        href={allHref}
        className={`${CHIP_BASE} ${activeFeed === "all" ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        aria-current={activeFeed === "all" ? "page" : undefined}
      >
        すべて
      </Link>
      <Link
        href="/feed"
        className={`relative ${CHIP_BASE} ${
          activeFeed === "following" ? CHIP_ACTIVE : CHIP_INACTIVE
        }`}
        aria-current={activeFeed === "following" ? "page" : undefined}
      >
        フォロー中
        {hasNew && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-gray-950"
            aria-label="新着あり"
          />
        )}
      </Link>

      {followingUsers.length > 0 && (
        <>
          <span
            className="shrink-0 select-none text-gray-300 dark:text-gray-600"
            aria-hidden="true"
          >
            ｜
          </span>
          {followingUsers.map((u) => (
            <Link
              key={u.id}
              href={`/users/${u.id}`}
              className={`${CHIP_BASE} flex items-center gap-1.5 ${CHIP_INACTIVE}`}
              title={u.displayName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={u.avatarUrl || "/avatar-placeholder.svg"}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
              />
              <span className="max-w-[8rem] truncate">{u.displayName}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
