"use client";

import { useEffect, useRef } from "react";
import type { TrackReference } from "@livekit/components-react";

// 画面共有の視聴モーダル。
// 「画面を見る」を押したときだけ開く。閉じても共有者側の配信は止まらない
// （共有しているか／見ているかは完全に別の状態として扱う）。
export function ScreenShareModal({
  trackRef,
  sharerName,
  onClose,
}: {
  trackRef: TrackReference;
  sharerName: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // トラックを <video> に接続する。モーダルを閉じたら必ず切り離す
  // （detach を忘れると裏で描画が続き、無駄な負荷になる）。
  useEffect(() => {
    const el = videoRef.current;
    const track = trackRef.publication?.track;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [trackRef]);

  // Esc で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${sharerName}さんの画面共有`}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-4 py-2">
          <p className="truncate text-sm font-medium text-white">
            🖥 {sharerName}さんの画面共有
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded-md px-2 py-1 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
          >
            ✕
          </button>
        </div>
        {/* アスペクト比を保ったまま枠に収める。モバイルでは画面幅に追従する。 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-h-[75vh] w-full bg-black object-contain"
        />
      </div>
    </div>
  );
}
