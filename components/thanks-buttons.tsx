"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { sendThanks } from "@/lib/wallet/transfer";
import { checkSufficientBalance } from "@/lib/wallet/symbol";
import { formatXym } from "@/lib/format";
import { THANKS_CONFIG, type ThanksType } from "@/lib/thanks";

export function ThanksButtons({
  reactionId,
  receiverName,
  receiverAddress,
  sentType,
}: {
  reactionId: string;
  receiverName: string;
  receiverAddress: string | null;
  sentType: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<ThanksType | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sentType) {
    return (
      <span className="text-xs font-medium text-green-700 dark:text-green-300">
        ✓ {sentType === "super_thanks" ? "Super Thanks" : "Thanks!"} 送信済み
      </span>
    );
  }

  if (!receiverAddress) {
    return (
      <span className="text-xs text-gray-400">受取アドレス未設定</span>
    );
  }

  async function send() {
    if (!open || !receiverAddress) return;
    setError(null);
    const wallet = getStoredWallet();
    if (!wallet) {
      setError("送信には自分のウォレットが必要です。");
      return;
    }
    setBusy(true);
    try {
      const amount = THANKS_CONFIG[open].amount;
      const balErr = await checkSufficientBalance(wallet.address, amount);
      if (balErr) {
        setError(balErr);
        return;
      }
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      const signed = await sendThanks({
        privateKey,
        recipientAddress: receiverAddress,
        amountXym: amount,
        reactionId,
      });
      const res = await fetch("/api/thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionId, thanksType: open, txHash: signed.hash }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "送信に失敗しました");
      setOpen(null);
      setPassphrase("");
      router.refresh();
    } catch (e) {
      if (e instanceof WrongPassphraseError) setError(e.message);
      else setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    const amount = THANKS_CONFIG[open].amount;
    const label = open === "super_thanks" ? "Super Thanks" : "Thanks!";
    return (
      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-semibold">{receiverName} さんに感謝を届けます 🎉</p>
        {/* 透明性のため最終確認では金額・送信先を表示 */}
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          内容: {label} / {formatXym(amount)} {THANKS_CONFIG.currency}
          <br />
          送信先: <span className="break-all font-mono">{receiverAddress}</span>
        </p>
        {error && (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="ウォレットパスワード"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || passphrase.length === 0}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "送信中..." : "感謝を届ける"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              setError(null);
            }}
            className="text-xs underline"
          >
            やめる
          </button>
        </div>
      </div>
    );
  }

  return (
    <span className="flex gap-2">
      <button
        type="button"
        onClick={() => setOpen("thanks")}
        className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
      >
        Thanks!
      </button>
      <button
        type="button"
        onClick={() => setOpen("super_thanks")}
        className="rounded-full border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-50 dark:hover:bg-amber-950"
      >
        Super Thanks
      </button>
    </span>
  );
}
