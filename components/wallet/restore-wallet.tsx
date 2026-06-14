"use client";

import { useState } from "react";
import {
  deriveAccount,
  isValidMnemonic,
} from "@/lib/wallet/symbol";
import { encryptPrivateKey, type EncryptedWallet } from "@/lib/wallet/crypto";

export function RestoreWallet({
  onComplete,
  onCancel,
}: {
  onComplete: (wallet: EncryptedWallet) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [mnemonic, setMnemonic] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore() {
    setError(null);
    const words = mnemonic.trim().replace(/\s+/g, " ");
    if (!isValidMnemonic(words)) {
      setError("リカバリーフレーズが正しくありません（12語または24語）。");
      return;
    }
    if (passphrase.length < 8) {
      setError("ウォレットパスフレーズは8文字以上にしてください。");
      return;
    }
    if (passphrase !== passphrase2) {
      setError("パスフレーズが一致しません。");
      return;
    }
    setBusy(true);
    try {
      const account = deriveAccount(words);
      const encrypted = await encryptPrivateKey(
        account.privateKey,
        passphrase,
        account.address
      );
      await onComplete(encrypted);
    } catch (e) {
      console.error(e);
      setError("復元に失敗しました。");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
      <h2 className="text-lg font-semibold">ウォレットを復元（インポート）</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        リカバリーフレーズ（24語など）を入力し、この端末用の新しいパスフレーズを設定します。
      </p>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          リカバリーフレーズ（単語をスペース区切りで入力）
          <textarea
            rows={3}
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスフレーズ（8文字以上）
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスフレーズ（確認）
          <input
            type="password"
            value={passphrase2}
            onChange={(e) => setPassphrase2(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={restore}
            disabled={busy}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy ? "復元中..." : "復元する"}
          </button>
          <button type="button" onClick={onCancel} className="text-sm underline">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
