"use client";

import { useState } from "react";
import { downloadRecoveryFile } from "@/lib/wallet/recovery-file";

/**
 * リカバリーフレーズをテキストファイルとして保存するボタン。
 *
 * 新規作成（登録）とウォレット追加の両方から使う。
 * どちらも同じ文面・同じ挙動にしたいので、ここへ寄せている。
 *
 * フレーズは props で受け取ってブラウザ内でファイル化するだけで、
 * サーバーへは一切送らない（CLAUDE.md の禁止事項）。
 */
export function RecoveryDownload({
  mnemonic,
  address,
  network,
}: {
  mnemonic: string;
  address: string;
  network: string;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    try {
      downloadRecoveryFile({ mnemonic, address, network });
      setSaved(true);
    } catch {
      // 失敗しても内容は出さない（フレーズが露出しうるため）。
      setError(
        "ファイルの保存に失敗しました。お手数ですが画面の単語を書き写してください。"
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          ⬇ テキストファイルで保存
        </button>
        {saved && (
          <span className="text-xs text-green-700 dark:text-green-400">
            保存しました
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        保存されるファイルは<strong>暗号化されていません</strong>。
        中身を見た人は誰でも資産を動かせます。共有フォルダやメールに置かず、
        印刷するか暗号化した場所へ移してください。紙に書き写すのがいちばん安全です。
      </p>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
