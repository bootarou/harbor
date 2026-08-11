"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// 画面右下に固定表示する「記事を書く」フローティングボタン（FAB）。
// ログイン中のみ表示し、投稿しやすくする。編集画面そのものでは重複するため隠す。
export function ComposeFab() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.user) return null;

  // 記事作成/編集ページでは非表示（フォーム内の保存ボタンと役割が重複するため）。
  const onEditor =
    pathname === "/posts/new" ||
    (pathname?.startsWith("/posts/") && pathname.endsWith("/edit"));
  // コミュニティの詳細ページ（トピック/作成/編集）は下部にチャット入力欄があるため非表示。
  const onCommunityDetail =
    pathname?.startsWith("/community/") ?? false;
  if (onEditor || onCommunityDetail) return null;

  return (
    <Link
      href="/posts/new"
      aria-label="記事を書く"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-gray-800 sm:bottom-6 sm:right-6 dark:bg-white dark:text-black dark:hover:bg-gray-200"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="hidden sm:inline">記事を書く</span>
    </Link>
  );
}
