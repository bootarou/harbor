"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { sendTip, sendAnswerTip } from "@/lib/wallet/transfer";
import { checkSufficientBalance } from "@/lib/wallet/symbol";

const MIN = 0.1;
const MAX = 10;
const STEP = 0.1;

export function TipBox({
  postId,
  answerId,
  recipientAddress,
  isAuthor,
}: {
  postId: string;
  // 指定時は QA 回答への投げ銭として扱う（宛先は回答者）。
  answerId?: string;
  recipientAddress: string | null;
  isAuthor: boolean;
}) {
  const isAnswer = answerId !== undefined;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const [anonymous, setAnonymous] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    // localStorage はクライアントでのみ参照可能なため、マウント後に同期する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasWallet(getStoredWallet() !== null);
  }, []);

  useEffect(() => {
    if (open && recipientAddress) {
      QRCode.toDataURL(recipientAddress, { margin: 1, width: 160 })
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [open, recipientAddress]);

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
      // 残高チェック（手数料込みで不足なら送信前に警告）。
      const balErr = await checkSufficientBalance(wallet.address, amount);
      if (balErr) {
        setError(balErr);
        return;
      }
      // パスフレーズで秘密鍵を復号（メモリ上のみ）。
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      // 署名・アナウンス（クライアントで完結）。回答への投げ銭は専用マーカーで送る。
      const signed = answerId
        ? await sendAnswerTip({
            privateKey,
            recipientAddress,
            amountXym: amount,
            answerId,
          })
        : await sendTip({
            privateKey,
            recipientAddress,
            amountXym: amount,
            postId,
          });
      // 記録（控え）をサーバーへ。送るのは txHash 等の公開情報のみ。
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          answerId,
          txHash: signed.hash,
          fromAddress: wallet.address,
          amount,
          anonymous,
        }),
      });
      if (!res.ok && res.status !== 409) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "記録に失敗しました");
      }
      setSuccessHash(signed.hash);
      setPassphrase("");
      router.refresh();
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        setError(e.message);
      } else {
        setError(
          e instanceof Error ? e.message : "投げ銭に失敗しました"
        );
      }
    } finally {
      setBusy(false);
    }
  }, [amount, anonymous, passphrase, postId, answerId, recipientAddress, router]);

  if (isAuthor) {
    return (
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        {isAnswer
          ? "自分の回答には投げ銭できません。"
          : "自分の記事には投げ銭できません。"}
      </p>
    );
  }

  if (!recipientAddress) {
    return (
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        {isAnswer
          ? "この回答者はまだウォレット（XYMアドレス）を設定していないため、投げ銭できません。"
          : "この著者はまだウォレット（XYMアドレス）を設定していないため、投げ銭できません。"}
      </p>
    );
  }

  if (successHash) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
        <p className="font-semibold text-green-800 dark:text-green-200">
          投げ銭を送信しました！🎉
        </p>
        <p className="mt-1 break-all text-xs text-green-700 dark:text-green-300">
          tx: {successHash}
        </p>
        <a
          href={`https://testnet.symbol.fyi/transactions/${successHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs underline"
        >
          エクスプローラーで確認
        </a>
        <p className="mt-2 text-xs text-green-700 dark:text-green-300">
          ※ ネットワークでの承認には少し時間がかかる場合があります。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
        >
          {isAnswer ? "💴 この回答に投げ銭する" : "💴 この記事に投げ銭する"}
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">投げ銭額</span>
            <span className="text-2xl font-bold">{amount.toFixed(1)} XYM</span>
          </div>
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4"
            />
            匿名で投げ銭する
          </label>

          <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="送金先アドレスQR" className="h-24 w-24" />
            )}
            <div className="min-w-0 text-xs text-gray-500 dark:text-gray-400">
              <p>送金先（{isAnswer ? "回答者" : "著者"}）アドレス</p>
              <p className="mt-1 break-all font-mono">{recipientAddress}</p>
              <p className="mt-1">別のウォレットからQRで送ることもできます。</p>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          {hasWallet ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                自分のウォレットのパスフレーズを入力して送金します（署名はこの端末内で行います）。
              </p>
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
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              投げ銭にはウォレットが必要です。
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
