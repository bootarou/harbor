"use client";

import { useState } from "react";

// プロフィールのカバー画像。
// 読み込みに失敗したとき（404・無効URL等）は壊れた画像アイコンを出さず、
// 「Harbor」文字のみのデフォルトカバーへフォールバックする。
export function CoverImage({ src }: { src: string | null }) {
  // 失敗した src を覚えておく。src が別の値に変われば自動で再表示を試みる。
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src != null && src === failedSrc;

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800">
        <span className="select-none text-2xl font-bold tracking-widest text-gray-300 sm:text-4xl dark:text-gray-700">
          Harbor
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
