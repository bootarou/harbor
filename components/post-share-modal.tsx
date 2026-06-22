"use client";

import { useState } from "react";

// 記事公開完了後にSNS共有を促すモーダル。
// 共有対象は公開した記事のURL（現在ページではなく url プロップを使う）。
export function PostShareModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function openShare(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=600");
  }
  function shareX() {
    openShare(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
    );
  }
  function shareLine() {
    openShare(
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  async function webShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* キャンセル等は無視 */
    }
  }

  const canWebShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="投稿完了・共有"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <p className="text-lg font-bold">投稿が完了しました！🎉</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          SNSで広めましょう！！
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={shareX}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
            </svg>
            X で共有
          </button>

          <button
            type="button"
            onClick={shareLine}
            className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: "#06C755" }}
          >
            LINE で共有
          </button>

          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            aria-live="polite"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" />
            </svg>
            {copied ? "コピーしました" : "URLをコピー"}
          </button>

          {canWebShare && (
            <button
              type="button"
              onClick={webShare}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              その他で共有
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md px-4 py-2 text-sm text-gray-500 underline dark:text-gray-400"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
