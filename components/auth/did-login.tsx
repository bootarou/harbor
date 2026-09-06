"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  decryptPrivateKey,
  WebCryptoUnavailableError,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import {
  getActiveAddress,
  getWalletByAddress,
  listWallets,
  setActiveAddress,
} from "@/lib/wallet/storage";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import { shortAddress } from "@/lib/did";

export function DidLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [wallets, setWallets] = useState<EncryptedWallet[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage はクライアントでのみ参照可能なため、マウント後に同期する。
    /* eslint-disable react-hooks/set-state-in-effect */
    const list = listWallets();
    setWallets(list);
    setSelected(getActiveAddress() ?? list[0]?.address ?? "");
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const wallet = getWalletByAddress(selected);
    if (!wallet) return;
    setBusy(true);
    try {
      const privateKey = await decryptPrivateKey(wallet, passphrase);
      const res = await didLoginWithPrivateKey(privateKey);
      if (!res.ok) {
        setError(res.error ?? "ログインに失敗しました");
        return;
      }
      setActiveAddress(selected);
      setPassphrase("");
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

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  // まだこの端末にウォレットが無い状態。
  // 「見つかりません」とだけ出しても次に何をすればよいか分からないので、
  // 前提（アドレスが要る）と、初めての人／既に持っている人の分岐を示す。
  if (wallets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="font-medium">この端末にはウォレットがありません</p>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Harbor はウォレットを<strong>この端末のブラウザ内だけ</strong>に保存します。
            別の端末やブラウザで作成したアドレスは、ここには出てきません。
          </p>
        </div>

        <Link
          href="/register?mode=create"
          className="rounded-lg bg-black px-4 py-3 text-white transition hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          <span className="block text-sm font-semibold">
            はじめての方 — 新しいSymbolアドレスを作成
          </span>
          <span className="mt-0.5 block text-xs opacity-80">
            メールアドレスは不要です。この端末で鍵を作り、ブラウザ内に保存します。
          </span>
        </Link>

        <Link
          href="/register?mode=import"
          className="rounded-lg border border-gray-300 px-4 py-3 transition hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600"
        >
          <span className="block text-sm font-semibold">
            すでにお持ちの方 — リカバリーフレーズ／秘密鍵で復元
          </span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            他の端末やほかのウォレットアプリで作ったSymbolアドレスを、この端末に取り込みます。
          </span>
        </Link>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          別の端末のHarborにログイン済みなら、下の「QRコードでログイン」が手軽です。
          リカバリーフレーズを入力せずに、この端末へ持ってこられます。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={login} className="flex flex-col gap-4">
      {/* アカウント選択（複数保持時） */}
      {wallets.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          アカウントを選択
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {wallets.map((w) => (
              <option key={w.address} value={w.address}>
                {shortAddress(w.address)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ウォレット:{" "}
          <span className="font-mono">{shortAddress(selected)}</span>
        </p>
      )}

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
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 pr-16 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            aria-pressed={showPass}
            aria-label={showPass ? "パスワードを隠す" : "パスワードを表示"}
            className="absolute inset-y-0 right-0 px-3 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {showPass ? "隠す" : "表示"}
          </button>
        </div>
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
          新しいアカウントを作成
        </Link>
        <Link href="/register?mode=import" className="underline">
          別のアカウントを追加
        </Link>
      </div>
    </form>
  );
}
