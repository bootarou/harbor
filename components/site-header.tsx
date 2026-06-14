"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function SiteHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-bold">
          Harbor
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {status === "loading" ? null : session?.user ? (
            <>
              <Link
                href="/posts/new"
                className="rounded-md bg-black px-3 py-1.5 font-medium text-white dark:bg-white dark:text-black"
              >
                記事を書く
              </Link>
              <Link href="/feed" className="hover:underline">
                フォロー中
              </Link>
              <Link href="/notifications" className="hover:underline">
                通知
              </Link>
              <Link href="/dashboard" className="hover:underline">
                マイ記事
              </Link>
              <Link href="/wallet" className="hover:underline">
                ウォレット
              </Link>
              <Link href="/tips" className="hover:underline">
                投げ銭履歴
              </Link>
              <Link href="/profile" className="hover:underline">
                プロフィール
              </Link>
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
      </div>
    </header>
  );
}
