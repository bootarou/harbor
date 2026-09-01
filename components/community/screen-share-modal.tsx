"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TrackReference } from "@livekit/components-react";

// 画面共有の視聴モーダル。
// 「画面を見る」を押したときだけ開く。閉じても共有者側の配信は止まらない
// （共有しているか／見ているかは完全に別の状態として扱う）。
//
// 【重要】必ず body 直下へポータルで出すこと。
// 呼び出し元のチャット入力バーには backdrop-blur が掛かっており、
// backdrop-filter は position:fixed の包含ブロックを作る。そのまま描画すると
// inset-0 が入力バーの内側基準になり、モーダルが極端に低く潰れる。
export function ScreenShareModal({
  trackRef,
  sharerName,
  onClose,
}: {
  trackRef: TrackReference;
  sharerName: string;
  onClose: () => void;
}) {
  // Esc で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ポータル先は body。このコンポーネントは voice-space.tsx から ssr:false で
  // 読み込まれるが、念のため document の有無を見てから描画する。
  if (typeof document === "undefined") return null;

  return createPortal(
    <ModalBody trackRef={trackRef} sharerName={sharerName} onClose={onClose} />,
    document.body
  );
}

// 中身は別コンポーネントにする。ポータルが張られてから初めてマウントされるため、
// トラック接続の effect が実行される時点で <video> が確実に存在する
// （外側で分岐すると videoRef が null のまま effect が走り、映像が出ない）。
function ModalBody({
  trackRef,
  sharerName,
  onClose,
}: {
  trackRef: TrackReference;
  sharerName: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // トラックを <video> に接続する。閉じたら必ず切り離す
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${sharerName}さんの画面共有`}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-gray-900 shadow-xl"
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
        {/* アスペクト比を保ったまま枠いっぱいに表示する。
            モバイルでは画面幅に、PCでは高さに追従する。 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-[80vh] w-full bg-black object-contain"
        />
      </div>
    </div>
  );
}
