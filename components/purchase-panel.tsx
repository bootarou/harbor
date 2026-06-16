"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { sendPurchase } from "@/lib/wallet/transfer";
import { checkSufficientBalance } from "@/lib/wallet/symbol";
import { formatXym } from "@/lib/format";

export function PurchasePanel({
  postId,
  title,
  authorName,
  sellerAddress,
  priceAmount,
  priceCurrency,
}: {
  postId: string;
  title: string;
  authorName: string;
  sellerAddress: string;
  priceAmount: number;
  priceCurrency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setError(null);
    const wallet = getStoredWallet();
    if (!wallet) {
      setError("購入には自分のウォレットが必要です。");
      return;
    }
    setBusy(true);
    try {
      const balErr = await checkSufficientBalance(wallet.address, priceAmount);
      if (balErr) {
        setError(balErr);
        return;
      }
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      // 投稿者(販売者)へ直接送金（運営は送金を預からない）。
      const signed = await sendPurchase({
        privateKey,
        recipientAddress: sellerAddress,
        amountXym: priceAmount,
        postId,
      });
      // サーバーがオンチェーン検証してから記録 → 全文解除。
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, txHash: signed.hash }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "購入の確認に失敗しました");
      }
      setPassphrase("");
      router.refresh(); // 全文解除を反映
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "購入に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  }

  const hasWallet = typeof window !== "undefined" && getStoredWallet() !== null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/40">
      <h3 className="text-base font-bold">この続きは購読権の購入で読めます</h3>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
        >
          {formatXym(priceAmount)} {priceCurrency} で全文を読む
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {/* 購入前確認 */}
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
            <dt className="text-gray-500">記事</dt>
            <dd className="truncate font-medium">{title}</dd>
            <dt className="text-gray-500">投稿者</dt>
            <dd>{authorName}</dd>
            <dt className="text-gray-500">販売価格</dt>
            <dd className="font-semibold">
              {formatXym(priceAmount)} {priceCurrency}
            </dd>
            <dt className="text-gray-500">送金先</dt>
            <dd className="break-all font-mono text-xs">{sellerAddress}</dd>
          </dl>

          <div className="rounded-md bg-white/70 p-3 text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300">
            本記事の販売者は投稿者です。
            <br />
            送金は利用者のウォレットから販売者のアドレスへ直接行われます。
            <br />
            運営は送金を預かりません。
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {hasWallet ? (
            <>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="ウォレットパスフレーズ"
                className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={buy}
                  disabled={busy || passphrase.length === 0}
                  className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy
                    ? "送金・確認中..."
                    : `${formatXym(priceAmount)} ${priceCurrency} を送って購入`}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm underline"
                >
                  閉じる
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              購入にはウォレットが必要です。
              <a href="/wallet" className="ml-1 underline">
                ウォレットを作成/復元
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
