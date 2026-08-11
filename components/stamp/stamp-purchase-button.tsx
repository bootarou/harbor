"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { sendStampPurchase } from "@/lib/wallet/transfer";
import { checkSufficientBalance } from "@/lib/wallet/symbol";
import { formatXym } from "@/lib/format";

// スタンプ購入ボタン＋モーダル。有料記事購入(PurchasePanel)と同じ送金・確認パターン。
export function StampPurchaseButton({
  stampId,
  name,
  authorName,
  sellerAddress,
  price,
  size = "md",
}: {
  stampId: string;
  name: string;
  authorName: string;
  sellerAddress: string;
  price: number;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const storageKey = `nagexym.stamp-purchase.${stampId}`;
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingTx(window.localStorage.getItem(storageKey));
  }, [storageKey]);

  const confirmTx = useCallback(
    async (txHash: string) => {
      setError(null);
      setInfo(null);
      setBusy(true);
      try {
        const res = await fetch("/api/stamps/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stampId, txHash }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
          pending?: boolean;
        } | null;
        if (res.ok) {
          window.localStorage.removeItem(storageKey);
          setPendingTx(null);
          setOpen(false);
          router.refresh();
          return;
        }
        if (res.status === 202 || data?.pending) {
          setInfo(
            data?.message ??
              "送金はまだ反映されていません。しばらくして「再確認」してください。"
          );
          return;
        }
        setError(
          (data?.error ?? "購入を確認できませんでした。") +
            " 送金は送信済みのため再送信されません。時間をおいて再確認してください。"
        );
      } catch {
        setError("通信に失敗しました。時間をおいて再確認してください。");
      } finally {
        setBusy(false);
      }
    },
    [stampId, storageKey, router]
  );

  const buy = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (pendingTx) {
      void confirmTx(pendingTx);
      return;
    }
    const wallet = getStoredWallet();
    if (!wallet) {
      setError("購入には自分のウォレットが必要です。");
      return;
    }
    setBusy(true);
    try {
      const balErr = await checkSufficientBalance(wallet.address, price);
      if (balErr) {
        setError(balErr);
        return;
      }
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      const signed = await sendStampPurchase({
        privateKey,
        recipientAddress: sellerAddress,
        amountXym: price,
        stampId,
      });
      window.localStorage.setItem(storageKey, signed.hash);
      setPendingTx(signed.hash);
      setPassphrase("");
    } catch (e) {
      if (e instanceof WrongPassphraseError) setError(e.message);
      else setError(e instanceof Error ? e.message : "送金に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [pendingTx, confirmTx, passphrase, price, sellerAddress, stampId, storageKey]);

  // pendingTx 復元時、自動で一度だけ再確認する（モーダルは開く）。
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (pendingTx) {
      setOpen(true);
      void confirmTx(pendingTx);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTx]);

  const btnCls =
    size === "sm"
      ? "rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
      : "rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnCls}>
        購入する
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
            <h3 className="text-base font-bold">スタンプを購入</h3>
            <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
              <dt className="text-gray-500">スタンプ</dt>
              <dd className="truncate font-medium">{name}</dd>
              <dt className="text-gray-500">作者</dt>
              <dd>{authorName}</dd>
              <dt className="text-gray-500">価格</dt>
              <dd className="font-semibold">{formatXym(price)} XYM</dd>
              <dt className="text-gray-500">送金先</dt>
              <dd className="break-all font-mono text-xs">{sellerAddress}</dd>
            </dl>

            <p className="mt-3 rounded-md bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              送金は利用者のウォレットから作者のアドレスへ直接行われます。運営は送金を預かりません。購入すると、このスタンプを記事に貼れるようになります。
            </p>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            {info && (
              <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {info}
              </p>
            )}

            {pendingTx ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                  送金は送信済みです（確認中）。<strong>もう一度送金しないでください。</strong>
                </p>
                <button
                  type="button"
                  onClick={() => confirmTx(pendingTx)}
                  disabled={busy}
                  className="self-start rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy ? "確認中..." : "購入を再確認する"}
                </button>
              </div>
            ) : (
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
                    onClick={buy}
                    disabled={busy || passphrase.length === 0}
                    className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                  >
                    {busy ? "送金・確認中..." : `${formatXym(price)} XYM で購入`}
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
