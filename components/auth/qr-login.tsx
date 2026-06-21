"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  decryptPrivateKey,
  WebCryptoUnavailableError,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import { addWallet, setActiveAddress } from "@/lib/wallet/storage";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import { parseTransferredWallet } from "@/lib/wallet/portable";
import { isCameraScanSupported } from "@/lib/wallet/capabilities";
import { useQrScanner } from "@/components/wallet/use-qr-scanner";
import { shortAddress } from "@/lib/did";

type Step = "idle" | "scanning" | "paste" | "passphrase";

// QRコードでログイン（ログインページ用）。
// 別端末で表示した暗号化ウォレットのQRをカメラ（jsqr）または手入力で読み取り、
// パスフレーズで復号 → この端末に取り込み（localStorage 保存）→ 既存の DID 署名ログインに合流。
// 「新規作成→ログイン→ウォレット移行」の遠回りを避け、QRから直接ログインできる。
export function QrLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");

  const [pending, setPending] = useState<EncryptedWallet | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSupported(isCameraScanSupported());
  }, []);

  // 読み取った文字列を検証 →「パスフレーズ」へ。
  const handleScannedText = useCallback((text: string) => {
    try {
      const wallet = parseTransferredWallet(text);
      setPending(wallet);
      setError(null);
      setPassphrase("");
      setStep("passphrase");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました。");
    }
  }, []);

  const { videoRef, start: startScanner, stop: stopCamera } =
    useQrScanner(handleScannedText);

  async function startScan() {
    setError(null);
    setStep("scanning");
    const res = await startScanner();
    if (!res.ok) {
      setStep("idle");
      setError(res.error ?? "カメラを起動できませんでした。");
    }
  }

  function cancelScan() {
    stopCamera();
    setStep("idle");
  }

  function submitPaste() {
    if (pasteText.trim().length === 0) return;
    handleScannedText(pasteText.trim());
  }

  // パスフレーズで復号 → 取り込み（保存）→ DID ログイン。
  async function loginWithPending(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const privateKey = await decryptPrivateKey(pending, passphrase);
      // この端末に取り込む（以後はパスワードでログインできる）。
      addWallet(pending);
      setActiveAddress(pending.address);
      // 取り込んだウォレットで DID ログイン（署名のみ送信・秘密鍵は送らない）。
      const res = await didLoginWithPrivateKey(privateKey);
      if (!res.ok) {
        setError(res.error ?? "ログインに失敗しました");
        return;
      }
      // 公開アドレスをサーバーへ登録（ログイン後なので認証済み）。失敗しても続行。
      fetch("/api/wallet/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: pending.address }),
      }).catch(() => {});
      setPassphrase("");
      setPending(null);
      setStep("idle");
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
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
      <p className="text-sm font-semibold">QRコードでログイン</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        別端末（PC等）の「QRコードで別端末へ転送」で表示したQRを読み取り、この端末に取り込んでログインします。
        開くにはパスフレーズが必要です。
      </p>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step === "idle" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {supported && (
              <button
                type="button"
                onClick={startScan}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700"
              >
                カメラで読み取る
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("paste");
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700"
            >
              手入力で貼り付け
            </button>
          </div>
          {!supported && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ※ カメラ読み取りはHTTPS接続の対応端末でのみ使えます。それ以外は手入力で貼り付けてください。
            </p>
          )}
        </div>
      )}

      {step === "scanning" && (
        <div className="flex flex-col items-center gap-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full max-w-xs rounded-md border border-gray-200 dark:border-gray-700"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            QRコードを枠内に映してください…
          </p>
          <button type="button" onClick={cancelScan} className="text-xs underline">
            キャンセル
          </button>
        </div>
      )}

      {step === "paste" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder='{"version":1,"address":"...","salt":"...","iv":"...","ciphertext":"..."}'
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitPaste}
              disabled={pasteText.trim().length === 0}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              読み込む
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="text-xs underline"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {step === "passphrase" && pending && (
        <form onSubmit={loginWithPending} className="flex flex-col gap-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            読み取ったアカウント:{" "}
            <span className="font-mono">{shortAddress(pending.address)}</span>
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
          <button
            type="button"
            onClick={() => {
              setPending(null);
              setStep("idle");
            }}
            className="self-start text-xs underline"
          >
            取消
          </button>
        </form>
      )}
    </div>
  );
}
