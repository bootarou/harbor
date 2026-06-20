"use client";

import { useState } from "react";
import QRCode from "qrcode";
import type { EncryptedWallet } from "@/lib/wallet/crypto";
import { serializeWalletForTransfer } from "@/lib/wallet/portable";
import { shortAddress } from "@/lib/did";

// 機能A（PC側）: 使用中アカウントの「暗号化済み」ウォレットを QR コードで表示し、
// 別端末（スマホ）のカメラで読み取って取り込めるようにする。
// QR に含めるのは常に暗号化済みデータのみ。秘密鍵の平文・パスフレーズは絶対に含めない。
export function WalletQrExport({ wallet }: { wallet: EncryptedWallet }) {
  const [step, setStep] = useState<"idle" | "warning" | "shown">("idle");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function showQr() {
    setError(null);
    try {
      const text = serializeWalletForTransfer(wallet);
      const url = await QRCode.toDataURL(text, {
        margin: 1,
        width: 280,
        errorCorrectionLevel: "M",
      });
      setDataUrl(url);
      setStep("shown");
    } catch {
      setError("QRコードの生成に失敗しました。");
    }
  }

  function hide() {
    setStep("idle");
    setDataUrl(null);
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold">QRコードで別端末へ転送</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        このアカウントの<strong>暗号化済み</strong>ウォレットをQRコードで表示し、スマホのカメラで取り込めます。
        取り込んだ端末でも、開くにはパスフレーズが必要です（QRに秘密鍵やパスフレーズは含まれません）。
      </p>

      {step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("warning")}
          className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          QRコードを表示
        </button>
      )}

      {step === "warning" && (
        <div className="mt-3 flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            ⚠️ 画面を他人に見られないようにしてください
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            表示されるQRコードには暗号化済みのウォレットデータが含まれます。第三者に撮影されると、
            その人がパスフレーズを推測・入手した場合に資産を操作されるおそれがあります。
            周囲に人がいない安全な場所で、取り込む端末だけに読み取らせてください。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={showQr}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              理解した上で表示する
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

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {step === "shown" && dataUrl && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt="ウォレット転送用QRコード"
            width={280}
            height={280}
            className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700"
          />
          <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {shortAddress(wallet.address)}
          </p>
          <button
            type="button"
            onClick={hide}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            QRコードを閉じる
          </button>
        </div>
      )}
    </div>
  );
}
