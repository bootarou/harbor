"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { decryptPrivateKey, WrongPassphraseError } from "@/lib/wallet/crypto";
import { getStoredWallet } from "@/lib/wallet/storage";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import { shortAddress } from "@/lib/did";

export function DidLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [address, setAddress] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage はクライアントでのみ参照可能なため、マウント後に同期する。
    /* eslint-disable react-hooks/set-state-in-effect */
    const w = getStoredWallet();
    setAddress(w?.address ?? null);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const wallet = getStoredWallet();
    if (!wallet) return;
    setBusy(true);
    try {
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      const res = await didLoginWithPrivateKey(privateKey);
      if (!res.ok) {
        setError(res.error ?? "ログインに失敗しました");
        return;
      }
      setPassphrase("");
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof WrongPassphraseError
          ? err.message
          : "ログインに失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  if (!address) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          この端末にウォレットが見つかりません。
        </p>
        <Link
          href="/register?mode=create"
          className="rounded-md bg-black px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          新しいSymbolアドレスを作成する
        </Link>
        <Link
          href="/register?mode=import"
          className="rounded-md border border-gray-300 px-4 py-2.5 text-center text-sm font-medium dark:border-gray-700"
        >
          秘密鍵をインポートする
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={login} className="flex flex-col gap-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        ウォレット:{" "}
        <span className="font-mono">{shortAddress(address)}</span>
      </p>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-200">
        この署名はログイン認証用です。送金は発生せず、秘密鍵はサーバーに送信されません。
      </p>
      <label className="flex flex-col gap-1 text-sm">
        ウォレットパスワード
        <input
          type="password"
          required
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        {busy ? "署名・ログイン中..." : "Symbol DIDでログイン"}
      </button>
      <div className="flex justify-between text-xs">
        <Link href="/register?mode=create" className="underline">
          新しいアドレスを作成
        </Link>
        <Link href="/register?mode=import" className="underline">
          秘密鍵をインポート
        </Link>
      </div>
    </form>
  );
}
