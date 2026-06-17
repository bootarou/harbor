"use client";

import { useCallback, useEffect, useState } from "react";
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
  const storageKey = `nagexym.purchase.${postId}`;
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // 送信済みで確認待ちの txHash（再送信を防ぎ、以後は再確認のみ）。
  const [pendingTx, setPendingTx] = useState<string | null>(null);

  // 送信済みの txHash を localStorage から復元（リロード/再訪でも再送信しない）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingTx(window.localStorage.getItem(storageKey));
  }, [storageKey]);

  // 同じ txHash をサーバーで再確認する（送信はしない）。
  const confirmTx = useCallback(
    async (txHash: string) => {
      setError(null);
      setInfo(null);
      setBusy(true);
      try {
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, txHash }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
          pending?: boolean;
        } | null;

        if (res.ok) {
          // 記録成立 → 解除。
          window.localStorage.removeItem(storageKey);
          setPendingTx(null);
          router.refresh();
          return;
        }
        if (res.status === 202 || data?.pending) {
          // 反映待ち。再送信せず再確認を促す。
          setInfo(
            data?.message ??
              "送金はまだ反映されていません。しばらくして「再確認」してください。"
          );
          return;
        }
        // 不一致など。再送信はしない（多重課金防止）。
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
    [postId, storageKey, router]
  );

  // 新規送金（1回のみ）。送信したら即座に pendingTx を保存し、以後は再確認に切り替わる。
  const buy = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (pendingTx) {
      // 念のため: 既に送信済みなら再送信しない。
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
      // 送金できたら必ず pendingTx を保存（この時点で二重送信を完全に封じる）。
      // 保存後の確認は pendingTx の effect が一度だけ実行する（確認の二重実行を避ける）。
      window.localStorage.setItem(storageKey, signed.hash);
      setPendingTx(signed.hash);
      setPassphrase("");
    } catch (e) {
      if (e instanceof WrongPassphraseError) setError(e.message);
      else setError(e instanceof Error ? e.message : "送金に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [pendingTx, confirmTx, passphrase, postId, priceAmount, sellerAddress, storageKey]);

  // pendingTx 復元時、自動で一度だけ再確認する。
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (pendingTx) void confirmTx(pendingTx);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTx]);

  const hasWallet = typeof window !== "undefined" && getStoredWallet() !== null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/40">
      <h3 className="text-base font-bold">この続きは購読権の購入で読めます</h3>

      {!open && !pendingTx ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
        >
          {formatXym(priceAmount)} {priceCurrency} で全文を読む
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-3 text-sm">
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
            送金は利用者のウォレットから販売者のアドレスへ直接行われます。運営は送金を預かりません。
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              {info}
            </p>
          )}

          {pendingTx ? (
            // 送信済み: 再送信せず、確認のみ。
            <div className="flex flex-col gap-2">
              <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                送金は送信済みです（確認中）。<strong>もう一度送金しないでください。</strong>
                反映までしばらくかかることがあります。
                <br />
                <span className="break-all font-mono">tx: {pendingTx}</span>
              </p>
              <button
                type="button"
                onClick={() => confirmTx(pendingTx)}
                disabled={busy}
                className="self-start rounded-md bg-amber-500 px-4 py-2 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
              >
                {busy ? "確認中..." : "購入を再確認する"}
              </button>
            </div>
          ) : hasWallet ? (
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
