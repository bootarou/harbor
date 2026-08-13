"use client";

import { useCallback, useEffect, useState } from "react";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { sendCommunityTip } from "@/lib/wallet/transfer";
import { checkSufficientBalance } from "@/lib/wallet/symbol";

const MIN = 0.1;
const MAX = 10;
const STEP = 0.1;

// チャットメッセージへの投げ銭ボタン＋スライダーモーダル。
// 成功時は onTipped(tipTotal, tipCount) で親に最新合計を渡す（楽観反映）。
export function CommunityTipButton({
  messageId,
  recipientAddress,
  authorName,
  onTipped,
}: {
  messageId: string;
  recipientAddress: string | null;
  authorName: string;
  onTipped: (tipTotal: number, tipCount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasWallet(getStoredWallet() !== null);
  }, [open]);

  const send = useCallback(async () => {
    setError(null);
    if (!recipientAddress) return;
    const wallet = getStoredWallet();
    if (!wallet) {
      setError("投げ銭には自分のウォレットが必要です。");
      return;
    }
    setBusy(true);
    try {
      const balErr = await checkSufficientBalance(wallet.address, amount);
      if (balErr) {
        setError(balErr);
        return;
      }
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      const signed = await sendCommunityTip({
        privateKey,
        recipientAddress,
        amountXym: amount,
        messageId,
      });
      const res = await fetch("/api/community/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, txHash: signed.hash }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        tipTotal?: number;
        tipCount?: number;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "記録に失敗しました");
      }
      if (typeof data.tipTotal === "number" && typeof data.tipCount === "number") {
        onTipped(data.tipTotal, data.tipCount);
      }
      setPassphrase("");
      setOpen(false);
    } catch (e) {
      if (e instanceof WrongPassphraseError) setError(e.message);
      else setError(e instanceof Error ? e.message : "投げ銭に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [amount, passphrase, messageId, recipientAddress, onTipped]);

  if (!recipientAddress) return null; // 受取アドレス未設定の投稿者には投げ銭不可

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-amber-600 hover:underline dark:text-amber-400"
      >
        投げ銭
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-base font-bold">投げ銭</h3>
              <span className="text-2xl font-bold">{amount.toFixed(1)} XYM</span>
            </div>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              {authorName} さんへ（受取: <span className="break-all font-mono">{recipientAddress}</span>）
            </p>
            <input
              type="range"
              min={MIN}
              max={MAX}
              step={STEP}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{MIN} XYM</span>
              <span>{MAX} XYM</span>
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {hasWallet ? (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="ウォレットパスフレーズ"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || passphrase.length === 0}
                    className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                  >
                    {busy ? "送信中..." : `${amount.toFixed(1)} XYM を送る`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm underline"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
                投げ銭にはウォレットが必要です。
                <a href="/wallet" className="ml-1 underline">
                  ウォレットを作成/復元
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
