"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  decryptPrivateKey,
  WebCryptoUnavailableError,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import { addWallet } from "@/lib/wallet/storage";
import { parseTransferredWallet } from "@/lib/wallet/portable";
import { isCameraScanSupported } from "@/lib/wallet/capabilities";
import { shortAddress } from "@/lib/did";

type Step = "idle" | "scanning" | "paste" | "verify" | "done";

// 機能A（スマホ側）: PCに表示したQRコードをカメラで読み取り（対応端末）、
// または手入力で貼り付けて、暗号化済みウォレットをこの端末に取り込む。
// 取り込みは「パスフレーズで正しく復号できることを確認してから」確定する。
export function WalletQrImport({
  onImported,
}: {
  onImported: (address: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");

  // 読み取り済み（未確定）の暗号化ウォレットと、確認用パスフレーズ。
  const [pending, setPending] = useState<EncryptedWallet | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 機能検出はマウント後に行い、SSR とのハイドレーション不一致を避ける。
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSupported(isCameraScanSupported());
  }, []);

  const stopCamera = useCallback(() => {
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
  useEffect(() => stopCamera, [stopCamera]);

  // 読み取った文字列を検証 →「確認（パスフレーズ）」へ。
  const handleScannedText = useCallback(
    (text: string) => {
      try {
        const wallet = parseTransferredWallet(text);
        setPending(wallet);
        setError(null);
        setPassphrase("");
        setStep("verify");
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み取りに失敗しました。");
      }
    },
    []
  );

  const startScan = useCallback(async () => {
    setError(null);
    // secure context（HTTPS/localhost）でないと getUserMedia は使えない（権限要求前に失敗する）。
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        "カメラはHTTPS接続でのみ使えます（http://192.168.x.x のようなLAN接続では起動できません）。手入力で貼り付けてください。"
      );
      return;
    }
    setStep("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        setStep("idle");
        setError("カメラ映像を表示できませんでした。手入力で貼り付けてください。");
        return;
      }
      video.srcObject = stream;
      await video.play();

      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      timerRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw) {
            stopCamera();
            handleScannedText(raw);
          }
        } catch {
          /* 1フレームの検出失敗は無視して次フレームへ */
        }
      }, 300);
    } catch (e) {
      stopCamera();
      setStep("idle");
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "カメラの使用が許可されませんでした。ブラウザの権限設定を確認してください。手入力でも取り込めます。"
          : name === "NotFoundError"
            ? "カメラが見つかりませんでした。手入力で貼り付けてください。"
            : "カメラを起動できませんでした（HTTPS接続が必要です）。手入力で貼り付けてください。"
      );
    }
  }, [handleScannedText, stopCamera]);

  function cancelScan() {
    stopCamera();
    setStep("idle");
  }

  function submitPaste() {
    if (pasteText.trim().length === 0) return;
    handleScannedText(pasteText.trim());
  }

  // パスフレーズで復号できることを確認してから localStorage に保存・確定する。
  async function confirmImport() {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      // 復号できれば正しいデータ＋正しいパスフレーズ。復号結果（秘密鍵）はここで破棄する。
      await decryptPrivateKey(pending, passphrase);
      addWallet(pending);
      // 公開アドレスのみサーバーへ登録（任意・失敗しても取り込みは成功）。
      try {
        await fetch("/api/wallet/address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: pending.address }),
        });
      } catch {
        /* 公開アドレス登録失敗は致命的でない */
      }
      const addr = pending.address;
      setPassphrase("");
      setPending(null);
      setStep("done");
      onImported(addr);
    } catch (e) {
      setError(
        e instanceof WrongPassphraseError || e instanceof WebCryptoUnavailableError
          ? e.message
          : "復号の確認に失敗しました。"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold">QRコードから読み込む</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        別端末（PC等）に表示した暗号化ウォレットのQRコードを取り込みます。取り込み後、開くにはパスフレーズが必要です。
      </p>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step === "idle" && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {supported && (
              <button
                type="button"
                onClick={startScan}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                カメラで読み取る
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("paste");
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
            >
              手入力で貼り付け
            </button>
          </div>
          {!supported && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ※ カメラ読み取りはHTTPS接続の対応端末（Android Chrome等）でのみ使えます。
              http://192.168.x.x のようなLAN接続では使えないため、手入力で貼り付けてください。
            </p>
          )}
        </div>
      )}

      {step === "scanning" && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full max-w-xs rounded-md border border-gray-200 dark:border-gray-700"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            QRコードを枠内に映してください…
          </p>
          <button
            type="button"
            onClick={cancelScan}
            className="text-xs underline"
          >
            キャンセル
          </button>
        </div>
      )}

      {step === "paste" && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder='{"version":1,"address":"...","salt":"...","iv":"...","ciphertext":"..."}'
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitPaste}
              disabled={pasteText.trim().length === 0}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              読み込む
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="text-xs underline"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {step === "verify" && pending && (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-gray-50 p-3 dark:bg-gray-900">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            読み取ったアカウント:{" "}
            <span className="font-mono">{shortAddress(pending.address)}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            このウォレットのパスフレーズを入力してください。正しく復号できることを確認してから保存します。
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="ウォレットパスフレーズ"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
            <button
              type="button"
              onClick={confirmImport}
              disabled={busy || passphrase.length === 0}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {busy ? "確認中..." : "保存"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPending(null);
              setStep("idle");
            }}
            className="self-start text-xs underline"
          >
            取消
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            ✓ ウォレットをこの端末に取り込みました。
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("idle");
            }}
            className="self-start text-xs underline"
          >
            続けて別のウォレットを読み込む
          </button>
        </div>
      )}
    </div>
  );
}
