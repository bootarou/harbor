"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// 記事・プロフィールのSNS共有リンク＋URLコピー（＋任意でQRコード表示）。
// 共有/コピーするURLはクリック時に window.location.href を使うため、
// NEXT_PUBLIC_SITE_URL の設定に依存せず正確になる（fallback として渡された url を使用）。
// showQr=true で「QRコード」ボタンを追加（スマホでのプロフィール交換用）。
export function ShareButtons({
  url,
  title,
  showQr = false,
}: {
  url: string;
  title: string;
  showQr?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    // Web Share API はクライアントのみ。SSRと差が出ないようマウント後に判定する。
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function currentUrl(): string {
    return typeof window !== "undefined" ? window.location.href : url;
  }

  function openShare(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  function shareX() {
    const u = currentUrl();
    openShare(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(u)}`
    );
  }

  function shareFacebook() {
    openShare(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl())}`
    );
  }

  function shareLine() {
    openShare(
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(currentUrl())}`
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function webShare() {
    try {
      await navigator.share({ title, url: currentUrl() });
    } catch {
      /* キャンセル等は無視 */
    }
  }

  async function openQr() {
    setQrError(false);
    try {
      const dataUrl = await QRCode.toDataURL(currentUrl(), {
        margin: 1,
        width: 240,
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrError(true);
      setQrDataUrl(null);
    }
  }

  function closeQr() {
    setQrDataUrl(null);
    setQrError(false);
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900";

  const canWebShare =
    mounted && typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">共有:</span>

      <button type="button" onClick={shareX} className={btn} aria-label="Xで共有">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
        X
      </button>

      <button type="button" onClick={shareFacebook} className={btn} aria-label="Facebookで共有">
        Facebook
      </button>

      <button type="button" onClick={shareLine} className={btn} aria-label="LINEで共有">
        LINE
      </button>

      {canWebShare && (
        <button type="button" onClick={webShare} className={btn}>
          その他で共有
        </button>
      )}

      <button type="button" onClick={copy} className={btn} aria-live="polite">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" />
        </svg>
        {copied ? "コピーしました" : "URLをコピー"}
      </button>

      {showQr && (
        <button
          type="button"
          onClick={openQr}
          className={btn}
          aria-label="QRコードを表示"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
            <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
            <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
            <path d="M14 14h3v3M21 14v7h-7" stroke="currentColor" strokeWidth="2" />
          </svg>
          QRコード
        </button>
      )}

      {qrError && (
        <span className="text-xs text-red-600 dark:text-red-400">
          QRコードの生成に失敗しました
        </span>
      )}

      {/* QRコード表示モーダル（プロフィール交換用） */}
      {qrDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="共有用QRコード"
          onClick={closeQr}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-3 rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
          >
            <p className="text-sm font-semibold">{title}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="共有用QRコード"
              width={240}
              height={240}
              className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700"
            />
            <p className="max-w-[240px] break-all text-center text-xs text-gray-500 dark:text-gray-400">
              {currentUrl()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              スマホのカメラで読み取って共有できます
            </p>
            <button
              type="button"
              onClick={closeQr}
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm dark:border-gray-700"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
