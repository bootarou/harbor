"use client";

import { useState } from "react";

const PLACEHOLDER = "/avatar-placeholder.svg";

// ユーザーのアイコン。
// avatarUrl が未設定のときに加え、**読み込みに失敗したとき**（404・無効URL等）も
// プレースホルダーへフォールバックする。
// SMD や X(Twitter) の画像を指している場合、URL が変わって 404 になることがあり、
// `src={url || PLACEHOLDER}` だけでは壊れた画像アイコンが出てしまうため。
export function UserAvatar({
  src,
  alt = "",
  className,
  style,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  // 失敗した src を覚えておく。src が別の値に変われば自動で再表示を試みる
  // （cover-image.tsx と同じ方針）。
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src != null && src === failedSrc;
  const url = !src || failed ? PLACEHOLDER : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      style={style}
      onError={() => {
        if (src) setFailedSrc(src);
      }}
    />
  );
}
