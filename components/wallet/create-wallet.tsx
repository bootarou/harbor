"use client";

import { useMemo, useState } from "react";
import { deriveAccount, generateMnemonic } from "@/lib/wallet/symbol";
import { encryptPrivateKey, type EncryptedWallet } from "@/lib/wallet/crypto";

type Step = "backup" | "confirm" | "passphrase";

export function CreateWallet({
  onComplete,
  onCancel,
}: {
  onComplete: (wallet: EncryptedWallet) => void | Promise<void>;
  onCancel: () => void;
}) {
  // ニーモニックはこのコンポーネントのメモリ上にのみ保持する。
  const [mnemonic] = useState<string>(() => generateMnemonic());
  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);

  const [step, setStep] = useState<Step>("backup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // バックアップ確認用に2つの単語位置をランダムに選ぶ（マウント時に一度だけ）。
  const [checkIndices] = useState<[number, number]>(() => {
    const len = 24;
    const a = Math.floor(Math.random() * len);
    let b = Math.floor(Math.random() * len);
    while (b === a) b = Math.floor(Math.random() * len);
    return a < b ? [a, b] : [b, a];
  });

  const [answer0, setAnswer0] = useState("");
  const [answer1, setAnswer1] = useState("");

  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");

  function confirmBackup() {
    setError(null);
    if (
      answer0.trim() !== words[checkIndices[0]] ||
      answer1.trim() !== words[checkIndices[1]]
    ) {
      setError("入力された単語が一致しません。バックアップを確認してください。");
      return;
    }
    setStep("passphrase");
  }

  async function finish() {
    setError(null);
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
      // 導出 → 暗号化（いずれもクライアント内で完結）。
      const account = deriveAccount(mnemonic);
      const encrypted = await encryptPrivateKey(
        account.privateKey,
        passphrase,
        account.address
      );
      await onComplete(encrypted);
    } catch (e) {
      console.error(e);
      setError("ウォレットの作成に失敗しました。");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-800">
      <h2 className="text-lg font-semibold">ウォレットを作成</h2>

      {step === "backup" && (
        <div className="mt-4">
          <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            以下の24個の単語（リカバリーフレーズ）を順番どおりに紙などへ控えてください。
            <ul className="ml-4 mt-2 list-disc">
              <li>復元・別端末での利用に必要です。</li>
              <li>このフレーズは<strong>サーバーには保存されません</strong>。</li>
              <li>他人に教えると資産を盗まれます。絶対に共有しないでください。</li>
            </ul>
          </div>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((w, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-700"
              >
                <span className="w-5 text-right text-xs text-gray-400">
                  {i + 1}
                </span>
                <span className="font-mono">{w}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              控えました、次へ
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm underline"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            バックアップ確認のため、次の単語を入力してください。
          </p>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm">
            {checkIndices[0] + 1} 番目の単語
            <input
              value={answer0}
              onChange={(e) => setAnswer0(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 font-mono dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {checkIndices[1] + 1} 番目の単語
            <input
              value={answer1}
              onChange={(e) => setAnswer1(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 font-mono dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={confirmBackup}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              確認
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("backup");
              }}
              className="text-sm underline"
            >
              フレーズを再確認
            </button>
          </div>
        </div>
      )}

      {step === "passphrase" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            ウォレットパスフレーズを設定してください。秘密鍵はこのパスフレーズで暗号化し、
            この端末のブラウザ内（localStorage）にのみ保存します。
          </p>
          <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            セキュリティのため、ログイン用パスワードとは<strong>異なる</strong>ものを設定してください。
          </p>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
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
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy ? "作成中..." : "ウォレットを作成"}
          </button>
        </div>
      )}
    </div>
  );
}
