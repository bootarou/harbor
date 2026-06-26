"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { purgeAwareSignOut } from "@/lib/wallet/purge-session";

// ヘッダーのサイト名。NEXT_PUBLIC_SITE_NAME で差し替え可能（未設定時は既定の "⚓Harbor"）。
// NEXT_PUBLIC_* はビルド時に焼き込まれるため、変更後は再ビルドが必要。
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "⚓Harbor";

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// クリックで親 <details> を閉じる（JS が動く場合の進化的拡張。
// JS が無い/動かない端末ではリンクは通常遷移し、遷移先で details は閉じた状態になる）。
function closeDetails(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}

export function SiteHeader() {
  const { data: session } = useSession();
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  const userId = session?.user?.id;

  // 未読通知数を取得。ログイン中は画面遷移ごとに再取得し、
  // /notifications を開くと（サーバー側で既読化されるため）0 に戻る。
  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetch("/api/notifications/unread-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d: { count?: number }) => {
        if (active) setUnread(typeof d.count === "number" ? d.count : 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, pathname]);

  const links = session?.user
    ? [
        { href: "/feed", label: "フォロー中" },
        { href: "/bookmarks", label: "ブックマーク" },
        { href: "/notifications", label: "通知" },
        { href: "/dashboard", label: "マイ記事" },
        { href: "/wallet", label: "ウォレット" },
        { href: "/tips", label: "投げ銭履歴" },
        // 自分の公開ページ（共有しやすい）へ。編集はそのページの「編集」ボタンから。
        { href: userId ? `/users/${userId}` : "/profile", label: "プロフィール" },
        // Harbor Status（港の管制塔）。認証不要だがプロフィールの右に置く。
        { href: "/status", label: "⚓ 港のいま" },
      ]
    : [];

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* ロゴは常に最新トップを取得したいので、通常クリックはフルリロードにする
            （同一 / にいてもサーバー再取得され、最新記事が読み込まれる）。
            修飾キー/中クリック（新規タブ等）はブラウザ既定に任せる。 */}
        <Link
          href="/"
          className="font-bold"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.location.assign("/");
          }}
        >
          {SITE_NAME}
        </Link>

        {/* デスクトップ: 横並びナビ */}
        <nav className="hidden items-center gap-3 text-sm sm:flex">
          {session?.user ? (
            <>
              <Link
                href="/posts/new"
                className="rounded-md bg-black px-3 py-1.5 font-medium text-white dark:bg-white dark:text-black"
              >
                記事を書く
              </Link>
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="hover:underline">
                  {l.label}
                  {l.href === "/notifications" && (
                    <NotificationBadge count={unread} />
                  )}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => purgeAwareSignOut({ callbackUrl: "/" })}
                className="hover:underline"
              >
                ログアウト
              </button>
            </>
          ) : (
            <>
              <Link href="/status" className="hover:underline">
                ⚓ 港のいま
              </Link>
              <Link href="/login" className="hover:underline">
                ログイン
              </Link>
              <Link
                href="/register"
                className="rounded-md border border-gray-300 px-3 py-1.5 dark:border-gray-700"
              >
                新規登録
              </Link>
            </>
          )}
        </nav>

        {/* モバイル: ベル（ヘッダー直下に常時表示）＋ ハンバーガー */}
        <div className="flex items-center gap-2 sm:hidden">
          {session?.user && (
            <Link
              href="/notifications"
              aria-label="通知"
              className="relative flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM9 21a3 3 0 0 0 6 0"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}

          <details className="relative">
            <summary
              aria-label="メニュー"
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 [&::-webkit-details-marker]:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </summary>
          <nav
            id="mobile-menu"
            className="absolute right-0 top-full z-20 mt-2 flex w-56 flex-col rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-950"
          >
            {session?.user ? (
              <>
                <Link href="/posts/new" onClick={closeDetails} className="rounded-md px-2 py-2 font-medium">
                  記事を書く
                </Link>
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={closeDetails}
                    aria-current={pathname === l.href ? "page" : undefined}
                    className="rounded-md px-2 py-2 hover:underline"
                  >
                    {l.label}
                    {l.href === "/notifications" && (
                      <NotificationBadge count={unread} />
                    )}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    closeDetails(e);
                    purgeAwareSignOut({ callbackUrl: "/" });
                  }}
                  className="rounded-md px-2 py-2 text-left hover:underline"
                >
                  ログアウト
                </button>
              </>
            ) : (
              <>
                <Link href="/status" onClick={closeDetails} className="rounded-md px-2 py-2 hover:underline">
                  ⚓ 港のいま
                </Link>
                <Link href="/login" onClick={closeDetails} className="rounded-md px-2 py-2 hover:underline">
                  ログイン
                </Link>
                <Link href="/register" onClick={closeDetails} className="rounded-md px-2 py-2 hover:underline">
                  新規登録
                </Link>
              </>
            )}
          </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
