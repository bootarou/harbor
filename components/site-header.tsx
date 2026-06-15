"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export function SiteHeader() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // ナビ項目を一元管理し、デスクトップ（横並び）とモバイル（ドロワー）で共用する。
  const close = () => setOpen(false);

  const links = session?.user
    ? [
        { href: "/feed", label: "フォロー中" },
        { href: "/notifications", label: "通知" },
        { href: "/dashboard", label: "マイ記事" },
        { href: "/wallet", label: "ウォレット" },
        { href: "/tips", label: "投げ銭履歴" },
        { href: "/profile", label: "プロフィール" },
      ]
    : [];

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="font-bold" onClick={close}>
          Harbor
        </Link>

        {/* デスクトップ: 横並びナビ */}
        <nav className="hidden items-center gap-3 text-sm sm:flex">
          {status === "loading" ? null : session?.user ? (
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
                </Link>
              ))}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="hover:underline"
              >
                ログアウト
              </button>
            </>
          ) : (
            <>
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

        {/* モバイル: ハンバーガーボタン */}
        {status === "loading" ? null : (
          <button
            type="button"
            aria-label="メニュー"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 sm:hidden dark:border-gray-700"
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* モバイル: ドロワー */}
      {open && status !== "loading" && (
        <nav
          id="mobile-menu"
          className="border-t border-gray-200 px-4 py-2 text-sm sm:hidden dark:border-gray-800"
        >
          {session?.user ? (
            <div className="flex flex-col">
              <Link
                href="/posts/new"
                onClick={close}
                className="rounded-md py-2 font-medium"
              >
                記事を書く
              </Link>
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className="rounded-md py-2 hover:underline"
                >
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  close();
                  signOut({ callbackUrl: "/" });
                }}
                className="rounded-md py-2 text-left hover:underline"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <Link href="/login" onClick={close} className="rounded-md py-2 hover:underline">
                ログイン
              </Link>
              <Link href="/register" onClick={close} className="rounded-md py-2 hover:underline">
                新規登録
              </Link>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
