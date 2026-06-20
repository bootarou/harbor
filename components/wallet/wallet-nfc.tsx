"use client";

import { useEffect, useState } from "react";
import type { EncryptedWallet } from "@/lib/wallet/crypto";
import { removeWallet } from "@/lib/wallet/storage";
import { serializeWalletForTransfer } from "@/lib/wallet/portable";
import { isNfcSupported } from "@/lib/wallet/capabilities";
import { shortAddress } from "@/lib/did";

type Step = "idle" | "writing" | "written";

// 機能B: 使用中アカウントの暗号化済みウォレットを NFC タグへ書き出す（対応端末のみ）。
// 書き込むのは既存の暗号化フォーマットそのまま。NFC 専用の新フォーマットは作らない。
// 書き込み後、この端末から当該アカウントを削除するか確認する（複数アカウント対応は維持）。
export function WalletNfc({
  wallet,
  onAccountRemoved,
}: {
  wallet: EncryptedWallet;
  onAccountRemoved: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mnemonicSaved, setMnemonicSaved] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSupported(isNfcSupported());
  }, []);

  // 非対応端末では UI 自体を出さない。
  if (!supported) return null;

  async function writeTag() {
    setError(null);
    setStep("writing");
    try {
      const ndef = new NDEFReader();
      const text = serializeWalletForTransfer(wallet);
      await ndef.write({
        records: [{ recordType: "text", lang: "en", data: text }],
      });
      setMnemonicSaved(false);
      setStep("written");
    } catch (e) {
      setStep("idle");
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "NFCの利用が許可されませんでした。端末のNFCを有効にして再試行してください。"
          : "NFCタグへの書き込みに失敗しました。タグを端末に近づけたまま再試行してください。"
      );
    }
  }

  function deleteFromDevice() {
    if (!mnemonicSaved) return;
    const ok = window.confirm(
      "この端末からこのアカウントの鍵データを削除します。以後このアカウントを使うにはNFCタグが必要です。よろしいですか？"
    );
    if (!ok) return;
    removeWallet(wallet.address);
    setStep("idle");
    onAccountRemoved();
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold">NFCタグに書き出す（物理鍵）</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        このアカウントの<strong>暗号化済み</strong>ウォレットをNFCタグへ書き込みます。タグを「物理的な鍵」として使えます。
        開くにはパスフレーズが必要です（タグに秘密鍵の平文・パスフレーズは含まれません）。
      </p>
      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        ⚠️ タグを紛失・破損した場合、この端末からも鍵を削除しているとアカウントを開けなくなります。
        その場合は<strong>ニーモニックフレーズ（24語）で別アドレスへ資産を移すしかありません</strong>。
        必ずニーモニックを別途安全に保管してください。
      </p>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step !== "written" && (
        <button
          type="button"
          onClick={writeTag}
          disabled={step === "writing"}
          className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700"
        >
          {step === "writing"
            ? "タグをかざしてください…"
            : "NFCタグに書き出す"}
        </button>
      )}

      {step === "written" && (
        <div className="mt-3 flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-semibold">
            NFCへの書き出しが完了しました（{shortAddress(wallet.address)}）。
          </p>
          <p className="text-sm">この端末からも秘密鍵を削除しますか？</p>

          <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={mnemonicSaved}
              onChange={(e) => setMnemonicSaved(e.target.checked)}
              className="mt-0.5"
            />
            ニーモニックフレーズ（24語）を別途必ず保管しています。タグ紛失時はこれでのみ復旧できることを理解しました。
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={deleteFromDevice}
              disabled={!mnemonicSaved}
              className="rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400"
            >
              削除する（NFCタグのみを鍵にする）
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
            >
              残す（この端末でもタグでも使えるようにする）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
