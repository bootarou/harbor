"use client";

import { useCallback, useEffect, useRef } from "react";
import jsQR from "jsqr";

export type QrScanStart = { ok: boolean; error?: string };

// カメラ映像から jsqr で QR を読み取る共通フック（QR取り込み／QRログインで共用）。
// QR解析は jsqr（純JS）で行うため BarcodeDetector 非依存。HTTPS（secure context）必須。
// videoRef を <video> に付け、start() でスキャン開始、onDecode で1件読めたら自動停止する。
export function useQrScanner(onDecode: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 最新の onDecode を参照するための ref（start のクロージャ固定化を避ける）。
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // アンマウント時にカメラを確実に停止する。
  useEffect(() => stop, [stop]);

  const start = useCallback(async (): Promise<QrScanStart> => {
    // secure context（HTTPS/localhost）でないと getUserMedia は使えない（権限要求前に失敗する）。
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return {
        ok: false,
        error:
          "カメラはHTTPS接続でのみ使えます（http://192.168.x.x のようなLAN接続では起動できません）。手入力で貼り付けてください。",
      };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return {
          ok: false,
          error: "カメラ映像を表示できませんでした。手入力で貼り付けてください。",
        };
      }
      video.srcObject = stream;
      await video.play();

      // 毎フレーム、映像をキャンバスへ描画して jsqr で QR を解析する。
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      timerRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) return; // 映像が十分にデコードされるまで待つ
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          stop();
          onDecodeRef.current(code.data);
        }
      }, 300);
      return { ok: true };
    } catch (e) {
      stop();
      const name = e instanceof Error ? e.name : "";
      return {
        ok: false,
        error:
          name === "NotAllowedError"
            ? "カメラの使用が許可されませんでした。ブラウザの権限設定を確認してください。手入力でも取り込めます。"
            : name === "NotFoundError"
              ? "カメラが見つかりませんでした。手入力で貼り付けてください。"
              : "カメラを起動できませんでした（HTTPS接続が必要です）。手入力で貼り付けてください。",
      };
    }
  }, [stop]);

  return { videoRef, start, stop };
}
