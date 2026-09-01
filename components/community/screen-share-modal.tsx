"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Esc で閉じる。ただし全画面表示中は、ブラウザが全画面解除に使うため閉じない
  // （解除と同時にモーダルまで消えると意図しない挙動になる）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      onClose();
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 全画面状態はブラウザ側の操作（Esc・ネイティブUI）でも変わるため、
  // 自前の state ではなくイベントで同期する。
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const box = boxRef.current;
    if (box?.requestFullscreen) {
      void box.requestFullscreen().catch(() => undefined);
      return;
    }
    // iOS Safari は任意要素の全画面に非対応で、video 単体のみ許可される。
    const video = videoRef.current as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    video?.webkitEnterFullscreen?.();
  }, []);

  // 全画面 API が使えない環境ではボタンを出さない。
  // ref は描画中に参照できないため、video 要素ではなくプロトタイプの有無で判定する
  // （iOS Safari は任意要素の全画面に非対応で、video 単体のみ許可される）。
  const canFullscreen =
    typeof document !== "undefined" &&
    (document.fullscreenEnabled ||
      (typeof HTMLVideoElement !== "undefined" &&
        "webkitEnterFullscreen" in HTMLVideoElement.prototype));

  // 遅延購読のため、モーダルを開いた直後はまだトラックが届いていない。
  // 届いた時点で attach したいので、track 自体を依存に入れる。
  const track = trackRef.publication?.track;

  // トラックを <video> に接続する。閉じたら必ず切り離す
  // （detach を忘れると裏で描画が続き、無駄な負荷になる）。
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${sharerName}さんの画面共有`}
      onClick={onClose}
    >
      <div
        ref={boxRef}
        className={`flex flex-col overflow-hidden bg-gray-900 shadow-xl ${
          isFullscreen
            ? "h-screen w-screen rounded-none"
            : "max-h-full w-full max-w-6xl rounded-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-4 py-2">
          <p className="truncate text-sm font-medium text-white">
            🖥 {sharerName}さんの画面共有
          </p>
          <span className="flex shrink-0 items-center gap-1">
            {canFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "全画面を終了" : "全画面で表示"}
                aria-label={isFullscreen ? "全画面を終了" : "全画面で表示"}
                className="rounded-md px-2 py-1 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
              >
                {isFullscreen ? "⛶ 全画面を終了" : "⛶ 全画面"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded-md px-2 py-1 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
            >
              ✕
            </button>
          </span>
        </div>
        {/* アスペクト比を保ったまま枠いっぱいに表示する。
            モバイルでは画面幅に、PCでは高さに追従する。 */}
        <div
          className={`relative w-full bg-black ${
            isFullscreen ? "min-h-0 flex-1" : "h-[80vh]"
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
          />
          {/* 購読を開始してから映像が届くまでの間。無言の黒画面だと
              壊れたように見えるため、読み込み中であることを示す。 */}
          {!track && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              画面を読み込んでいます…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
