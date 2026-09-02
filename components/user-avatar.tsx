"use client";

import { useCallback, useState } from "react";

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

  const markFailed = useCallback(() => {
    if (src) setFailedSrc(src);
  }, [src]);

  // onError だけでは取りこぼす経路がある。
  // - サーバー描画された画像は、React がハンドラを取り付ける前に読み込みが始まり、
  //   ハイドレーション前に失敗するとエラーを受け取れない
  // - 失敗がブラウザにキャッシュされている場合も、同じく早すぎて拾えない
  // どちらも「壊れた画像アイコンのまま」になるため、要素が付いた時点で
  // 読み込み結果を直接見て判定する（complete かつ naturalWidth が 0 なら失敗）。
  const checkOnMount = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !src) return;
      if (el.complete && el.naturalWidth === 0) setFailedSrc(src);
    },
    [src]
  );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={checkOnMount}
      src={url}
      alt={alt}
      className={className}
      style={style}
      onError={markFailed}
    />
  );
}
