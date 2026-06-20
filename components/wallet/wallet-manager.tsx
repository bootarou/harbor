"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decryptPrivateKey,
  WebCryptoUnavailableError,
  WrongPassphraseError,
  type EncryptedWallet,
} from "@/lib/wallet/crypto";
import {
  getActiveAddress,
  listWallets,
  removeWallet,
  saveStoredWallet,
  setActiveAddress,
} from "@/lib/wallet/storage";
import { didLoginWithPrivateKey } from "@/lib/wallet/did-client";
import { fetchXymBalance } from "@/lib/wallet/symbol";
import { shortAddress } from "@/lib/did";
import { formatXym } from "@/lib/format";
import { CreateWallet } from "@/components/wallet/create-wallet";
import { RestoreWallet } from "@/components/wallet/restore-wallet";
import { WalletQrExport } from "@/components/wallet/wallet-qr-export";
import { WalletQrImport } from "@/components/wallet/wallet-qr-import";
import { WalletNfc } from "@/components/wallet/wallet-nfc";

type Mode = "idle" | "create" | "restore";

export function WalletManager({
  serverAddress,
}: {
  serverAddress: string | null;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [wallets, setWallets] = useState<EncryptedWallet[]>([]);
  const [activeAddr, setActiveAddr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setWallets(listWallets());
    setActiveAddr(getActiveAddress());
  }, []);

  useEffect(() => {
    // localStorage はクライアントでのみ読めるため、マウント後に同期する。
    /* eslint-disable react-hooks/set-state-in-effect */
    refresh();
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  // 作成/復元の完了。暗号化データを localStorage に保存（追加＆アクティブ化）し、公開アドレスのみサーバーへ送る。
  const handleComplete = useCallback(
    async (enc: EncryptedWallet) => {
      saveStoredWallet(enc);
      refresh();
      setMode("idle");
      setSyncError(null);
      try {
        const res = await fetch("/api/wallet/address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    },
    [refresh]
  );

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  const active = wallets.find((w) => w.address === activeAddr) ?? null;

  // ウォレット未所持: 最初の1つを作成/復元。
  if (wallets.length === 0) {
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
          <CreateWallet onComplete={handleComplete} onCancel={() => setMode("idle")} />
        )}
        {mode === "restore" && (
          <RestoreWallet onComplete={handleComplete} onCancel={() => setMode("idle")} />
        )}

        {/* 別端末からQR/NFCで取り込む（対応端末ではカメラ読み取り、それ以外は貼り付け） */}
        {mode === "idle" && (
          <WalletQrImport
            onImported={() => {
              refresh();
              router.refresh();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {syncError && (
        <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
          {syncError}
        </p>
      )}

      {/* アカウント一覧・切替 */}
      <AccountsPanel
        wallets={wallets}
        activeAddr={activeAddr}
        serverAddress={serverAddress}
        onChanged={() => {
          refresh();
          router.refresh();
        }}
        onAdd={(m) => setMode(m)}
      />

      {/* 追加（作成/復元） */}
      {mode === "create" && (
        <CreateWallet onComplete={handleComplete} onCancel={() => setMode("idle")} />
      )}
      {mode === "restore" && (
        <RestoreWallet onComplete={handleComplete} onCancel={() => setMode("idle")} />
      )}

      {/* 別端末からQR/NFCで取り込む */}
      <WalletQrImport
        onImported={() => {
          refresh();
          router.refresh();
        }}
      />

      {/* アクティブなウォレットの詳細 */}
      {active && (
        <ExistingWallet
          key={active.address}
          wallet={active}
          serverAddress={serverAddress}
          onAccountRemoved={() => {
            refresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AccountsPanel({
  wallets,
  activeAddr,
  serverAddress,
  onChanged,
  onAdd,
}: {
  wallets: EncryptedWallet[];
  activeAddr: string | null;
  serverAddress: string | null;
  onChanged: () => void;
  onAdd: (mode: "create" | "restore") => void;
}) {
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSwitch(address: string) {
    setError(null);
    const wallet = wallets.find((w) => w.address === address);
    if (!wallet) return;
    setBusy(true);
    try {
      // 切替はセッションも合わせるため再ログイン（署名する鍵とログイン中アカウントを一致させる）。
      const pk = await decryptPrivateKey(wallet, passphrase);
      const res = await didLoginWithPrivateKey(pk);
      if (!res.ok) {
        setError(res.error ?? "切替に失敗しました");
        return;
      }
      setActiveAddress(address);
      setPassphrase("");
      setSwitchTarget(null);
      onChanged();
    } catch (e) {
      setError(
        e instanceof WrongPassphraseError || e instanceof WebCryptoUnavailableError
          ? e.message
          : "切替に失敗しました"
      );
    } finally {
      setBusy(false);
    }
  }

  function doRemove(address: string) {
    const ok = window.confirm(
      "この端末からこのアカウントのウォレットを削除します。リカバリーフレーズ/秘密鍵がないと復元できません。よろしいですか？"
    );
    if (!ok) return;
    removeWallet(address);
    onChanged();
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">アカウント</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAdd("create")}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
          >
            ＋作成
          </button>
          <button
            type="button"
            onClick={() => onAdd("restore")}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
          >
            ＋復元/インポート
          </button>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {wallets.map((w) => {
          const isActive = w.address === activeAddr;
          return (
            <li key={w.address} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 font-mono text-sm">
                  {shortAddress(w.address)}
                  {isActive && (
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
                      使用中
                    </span>
                  )}
                  {serverAddress === w.address && !isActive && (
                    <span className="ml-2 text-[11px] text-gray-400">登録済み</span>
                  )}
                </span>
                <div className="flex shrink-0 gap-2">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setSwitchTarget(w.address);
                        setPassphrase("");
                        setError(null);
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs dark:border-gray-700"
                    >
                      切替
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => doRemove(w.address)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 dark:text-red-400"
                  >
                    削除
                  </button>
                </div>
              </div>

              {switchTarget === w.address && (
                <div className="flex flex-col gap-2 rounded-md bg-gray-50 p-2 dark:bg-gray-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    このアカウントに切り替えるにはパスワードを入力してください（再ログインします）。
                  </p>
                  {error && (
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="ウォレットパスワード"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                    />
                    <button
                      type="button"
                      onClick={() => doSwitch(w.address)}
                      disabled={busy || passphrase.length === 0}
                      className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      {busy ? "..." : "切替"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwitchTarget(null)}
                      className="text-xs underline"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExistingWallet({
  wallet,
  serverAddress,
  onAccountRemoved,
}: {
  wallet: EncryptedWallet;
  serverAddress: string | null;
  onAccountRemoved: () => void;
}) {
  const router = useRouter();
  const [addrSynced, setAddrSynced] = useState(serverAddress === wallet.address);
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
      if (!res.ok) throw new Error("登録に失敗しました");
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
        e instanceof WrongPassphraseError || e instanceof WebCryptoUnavailableError
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

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          使用中アカウントの公開アドレス
        </p>
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
                : "このアカウントの公開アドレスはサーバー未登録です。使用中アカウントとして登録すると投げ銭を受け取れます。"}
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
              <p className="text-xs text-red-600 dark:text-red-400">{addrSyncError}</p>
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
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{balanceError}</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm font-semibold">ウォレットのアンロック（秘密鍵の確認）</p>
        {privateKey ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
              アンロック済みです。秘密鍵はこの端末のメモリ上のみに保持しています。
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

      {/* 高度なウォレット運用（対応端末でのオプション機能） */}
      <WalletQrExport wallet={wallet} />
      <WalletNfc wallet={wallet} onAccountRemoved={onAccountRemoved} />
    </div>
  );
}
