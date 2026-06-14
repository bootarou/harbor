"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decryptPrivateKey,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import {
  clearStoredWallet,
  getStoredWallet,
  saveStoredWallet,
} from "@/lib/wallet/storage";
import { fetchXymBalance } from "@/lib/wallet/symbol";
import { formatXym } from "@/lib/format";
import { CreateWallet } from "@/components/wallet/create-wallet";
import { RestoreWallet } from "@/components/wallet/restore-wallet";

type Mode = "idle" | "create" | "restore";

export function WalletManager({
  serverAddress,
}: {
  serverAddress: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [wallet, setWallet] = useState<EncryptedWallet | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage はクライアントでのみ読めるため、マウント後に同期する
    // （SSR とのハイドレーション不整合を避けるため、初期表示は「読み込み中」固定）。
    /* eslint-disable react-hooks/set-state-in-effect */
    setWallet(getStoredWallet());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 作成/復元の完了。暗号化データを localStorage に保存し、公開アドレスのみサーバーへ送る。
  const handleComplete = useCallback(async (enc: EncryptedWallet) => {
    saveStoredWallet(enc);
    setWallet(enc);
    setMode("idle");
    setSyncError(null);
    try {
      const res = await fetch("/api/wallet/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 送信するのは公開アドレスのみ。
        body: JSON.stringify({ address: enc.address }),
      });
      if (!res.ok) {
        setSyncError(
          "ウォレットは保存しましたが、公開アドレスのサーバー登録に失敗しました。"
        );
      }
    } catch {
      setSyncError(
        "ウォレットは保存しましたが、公開アドレスのサーバー登録に失敗しました。"
      );
    }
  }, []);

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  if (!wallet) {
    return (
      <div className="flex flex-col gap-4">
        {serverAddress && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
            この端末にはウォレットがありません。別端末で作成済みの場合は、リカバリーフレーズで復元してください。
            <br />
            登録済みの公開アドレス:{" "}
            <span className="break-all font-mono">{serverAddress}</span>
          </p>
        )}
        {mode === "idle" && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              新しいウォレットを作成
            </button>
            <button
              type="button"
              onClick={() => setMode("restore")}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700"
            >
              フレーズから復元
            </button>
          </div>
        )}
        {mode === "create" && (
          <CreateWallet
            onComplete={handleComplete}
            onCancel={() => setMode("idle")}
          />
        )}
        {mode === "restore" && (
          <RestoreWallet
            onComplete={handleComplete}
            onCancel={() => setMode("idle")}
          />
        )}
      </div>
    );
  }

  return (
    <ExistingWallet
      wallet={wallet}
      serverAddress={serverAddress}
      syncError={syncError}
      onDeleted={() => {
        setWallet(null);
        setMode("idle");
      }}
    />
  );
}

function ExistingWallet({
  wallet,
  serverAddress,
  syncError,
  onDeleted,
}: {
  wallet: EncryptedWallet;
  serverAddress: string | null;
  syncError: string | null;
  onDeleted: () => void;
}) {
  const router = useRouter();
  // この端末のウォレットの公開アドレスがサーバーに登録済みか。
  const [addrSynced, setAddrSynced] = useState(
    serverAddress === wallet.address
  );
  const [addrSyncing, setAddrSyncing] = useState(false);
  const [addrSyncError, setAddrSyncError] = useState<string | null>(null);

  const saveAddress = useCallback(async () => {
    setAddrSyncError(null);
    setAddrSyncing(true);
    try {
      const res = await fetch("/api/wallet/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.address }),
      });
      if (!res.ok) {
        throw new Error("登録に失敗しました");
      }
      setAddrSynced(true);
      router.refresh();
    } catch {
      setAddrSyncError(
        "公開アドレスのサーバー登録に失敗しました。時間をおいて再試行してください。"
      );
    } finally {
      setAddrSyncing(false);
    }
  }, [wallet.address, router]);

  // 未登録/不一致なら自動で登録を試みる（投げ銭を受け取れるようにするため）。初回マウント時のみ。
  useEffect(() => {
    if (addrSynced) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void saveAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealKey, setRevealKey] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const refreshBalance = useCallback(async () => {
    setBalanceError(null);
    setBalanceLoading(true);
    try {
      setBalance(await fetchXymBalance(wallet.address));
    } catch {
      setBalanceError("残高を取得できませんでした（ノード接続を確認してください）。");
    } finally {
      setBalanceLoading(false);
    }
  }, [wallet.address]);

  async function unlock() {
    setUnlockError(null);
    setBusy(true);
    try {
      const pk = await decryptPrivateKey(wallet, passphrase);
      setPrivateKey(pk);
      setPassphrase("");
    } catch (e) {
      setUnlockError(
        e instanceof WrongPassphraseError
          ? e.message
          : "アンロックに失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    setPrivateKey(null);
    setRevealKey(false);
  }

  function remove() {
    const ok = window.confirm(
      "この端末からウォレットを削除します。リカバリーフレーズがないと復元できません。よろしいですか？"
    );
    if (!ok) return;
    clearStoredWallet();
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-5">
      {syncError && (
        <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
          {syncError}
        </p>
      )}

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">公開アドレス</p>
        <p className="mt-1 break-all font-mono text-sm">{wallet.address}</p>
        {addrSynced ? (
          <p className="mt-2 text-xs text-green-700 dark:text-green-300">
            ✓ サーバーに登録済み（投げ銭を受け取れます）
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              {addrSyncing
                ? "公開アドレスをサーバーに登録中..."
                : "公開アドレスがサーバー未登録です。登録すると投げ銭を受け取れます。"}
            </p>
            {!addrSyncing && (
              <button
                type="button"
                onClick={saveAddress}
                className="self-start rounded-md border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
              >
                サーバーに登録
              </button>
            )}
            {addrSyncError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {addrSyncError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">残高</p>
          <button
            type="button"
            onClick={refreshBalance}
            disabled={balanceLoading}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
          >
            {balanceLoading ? "取得中..." : "更新"}
          </button>
        </div>
        <p className="mt-2 text-2xl font-bold">
          {balance === null ? "—" : `${formatXym(balance)} XYM`}
        </p>
        {balanceError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {balanceError}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm font-semibold">ウォレットのアンロック</p>
        {privateKey ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
              アンロック済みです。（送金機能は Phase 6 で追加予定）
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setRevealKey((v) => !v)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
              >
                {revealKey ? "秘密鍵を隠す" : "秘密鍵を表示"}
              </button>
              <button
                type="button"
                onClick={lock}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
              >
                ロックする
              </button>
            </div>
            {revealKey && (
              <p className="break-all rounded-md bg-gray-100 p-2 font-mono text-xs dark:bg-gray-800">
                {privateKey}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              パスフレーズを入力すると、この端末のメモリ上でのみ秘密鍵を復号します（保存はしません）。
            </p>
            {unlockError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {unlockError}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="ウォレットパスフレーズ"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="button"
                onClick={unlock}
                disabled={busy || passphrase.length === 0}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {busy ? "..." : "アンロック"}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={remove}
        className="self-start text-sm text-red-600 underline dark:text-red-400"
      >
        この端末からウォレットを削除
      </button>
    </div>
  );
}
