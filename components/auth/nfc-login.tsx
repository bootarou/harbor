"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  decryptPrivateKey,
  WebCryptoUnavailableError,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import {
  addWallet,
  getWalletByAddress,
  removeWallet,
} from "@/lib/wallet/storage";
import { parseTransferredWallet } from "@/lib/wallet/portable";
import { isNfcSupported } from "@/lib/wallet/capabilities";
import { beginPurgeSession, endPurgeSession } from "@/lib/wallet/purge-session";
import { shortAddress } from "@/lib/did";

type Step = "idle" | "scanning" | "passphrase";

// 機能C: NFCタグでログイン（対応端末のみ）。
// タグの暗号化ウォレットを読み取り → パスフレーズで復号 → 既存の DID 署名ログインに合流。
// localStorage には一切保存しない（毎回タグが必要になる ＝ ATM方式の一時アンロック）。
// 「パージモード」を選ぶと、ログアウト時に一時データ（メモリ上の復号鍵）を確実に消去する。
export function NfcLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [purge, setPurge] = useState(false);
  const [pending, setPending] = useState<EncryptedWallet | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSupported(isNfcSupported());
    return () => abortRef.current?.abort();
  }, []);

  if (!supported) return null;

  function stopScan() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // NDEF テキストレコード群から、ウォレットとして解釈できる最初のものを取り出す。
  function extractWallet(message: NDEFMessage): EncryptedWallet | null {
    for (const record of message.records) {
      if (!record.data) continue;
      try {
        const text = new TextDecoder(record.encoding ?? "utf-8").decode(
          record.data
        );
        return parseTransferredWallet(text);
      } catch {
        /* このレコードはウォレットではない。次へ */
      }
    }
    return null;
  }

  async function startScan() {
    setError(null);
    setStep("scanning");
    try {
      const ndef = new NDEFReader();
      const controller = new AbortController();
      abortRef.current = controller;
      ndef.onreading = (ev: NDEFReadingEvent) => {
        const wallet = extractWallet(ev.message);
        if (!wallet) {
          setError("このタグに Harbor のウォレットデータが見つかりませんでした。");
          stopScan();
          setStep("idle");
          return;
        }
        stopScan();
        setPending(wallet);
        setPassphrase("");
        setStep("passphrase");
      };
      await ndef.scan({ signal: controller.signal });
    } catch {
      stopScan();
      setStep("idle");
      setError(
        "NFCの読み取りを開始できませんでした。端末のNFCを有効にして再試行してください。"
      );
    }
  }

  async function loginWithPending(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setBusy(true);
    // ロールバック用に、この口座が元から端末にあったかを記録。
    const alreadyExisted = getWalletByAddress(pending.address) !== null;
    let restored = false;
    // 新規復元した口座の後始末（ログイン失敗・例外時に呼ぶ。元からあった口座は消さない）。
    const rollback = () => {
      if (!restored) return;
      if (purge) endPurgeSession();
      else if (!alreadyExisted) removeWallet(pending.address);
    };
    try {
      // パスフレーズで復号（メモリ上のみ）。失敗すれば例外。
      const privateKey = await decryptPrivateKey(pending, passphrase);

      // A案: 暗号化ウォレットを localStorage に復元する（既存フローがそのまま使える）。
      addWallet(pending);
      restored = true;
      // 公開アドレスのみ任意でサーバー登録（失敗してもログインは続行）。
      fetch("/api/wallet/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: pending.address }),
      }).catch(() => {});

      // パージモードでは、このセッションで新規復元した口座をログアウト時に削除する。
      if (purge) beginPurgeSession(pending.address, !alreadyExisted);

      const res = await didLoginWithPrivateKey(privateKey);
      if (!res.ok) {
        rollback();
        setError(res.error ?? "ログインに失敗しました");
        return;
      }
      setPassphrase("");
      setPending(null);
      setStep("idle");
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      rollback();
      setError(
        err instanceof WrongPassphraseError ||
          err instanceof WebCryptoUnavailableError
          ? err.message
          : "ログインに失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
      <p className="text-sm font-semibold">NFCタグでログイン</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        対応端末でNFCタグをかざしてログインします。読み取ったウォレットをこの端末に取り込み、以降は通常どおり利用できます。
        パージモードを選ぶと、ログアウト時にこの端末から取り込んだウォレットを消去します。
      </p>

      <label className="flex items-start gap-2 rounded-md bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
        <input
          type="checkbox"
          checked={purge}
          onChange={(e) => setPurge(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <strong>パージモードでログイン</strong>（上級者向け）。ログアウト時にこの端末の一時データを完全に消去します。
          次回も必ずNFCタグが必要になります。ニーモニックフレーズを別途保管していることを前提とした機能です。
        </span>
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step === "idle" && (
        <button
          type="button"
          onClick={startScan}
          className="self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700"
        >
          NFCタグを読み取る
        </button>
      )}

      {step === "scanning" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            NFCタグを端末にかざしてください…
          </p>
          <button
            type="button"
            onClick={() => {
              stopScan();
              setStep("idle");
            }}
            className="text-xs underline"
          >
            キャンセル
          </button>
        </div>
      )}

      {step === "passphrase" && pending && (
        <form onSubmit={loginWithPending} className="flex flex-col gap-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            タグのアカウント:{" "}
            <span className="font-mono">{shortAddress(pending.address)}</span>
            {purge && (
              <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-200">
                パージモード
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              required
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="ウォレットパスフレーズ"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="submit"
              disabled={busy || passphrase.length === 0}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {busy ? "ログイン中..." : "ログイン"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
