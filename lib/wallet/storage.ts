// 暗号化済みウォレットの localStorage 入出力（ブラウザのみ）。
// 複数アカウント（複数の暗号化ウォレット）を保持し、1つを「アクティブ」とする。
// 保存するのは暗号化済みデータ（salt/iv/ciphertext）と公開アドレスのみ。
import type { EncryptedWallet } from "./crypto";

const STORE_KEY = "nagexym.wallets.v1";
const LEGACY_KEY = "nagexym.wallet.v1"; // 旧: 単一ウォレット

type Store = { active: string | null; wallets: EncryptedWallet[] };

function isValid(w: EncryptedWallet | null | undefined): w is EncryptedWallet {
  return !!w && w.version === 1 && !!w.ciphertext && !!w.address;
}

function read(): Store {
  if (typeof window === "undefined") return { active: null, wallets: [] };

  const raw = window.localStorage.getItem(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Store;
      if (Array.isArray(parsed.wallets)) {
        return {
          active: parsed.active ?? null,
          wallets: parsed.wallets.filter(isValid),
        };
      }
    } catch {
      /* fallthrough */
    }
  }

  // 旧形式（単一ウォレット）からの移行。
  const legacy = window.localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const w = JSON.parse(legacy) as EncryptedWallet;
      if (isValid(w)) {
        const store: Store = { active: w.address, wallets: [w] };
        write(store);
        window.localStorage.removeItem(LEGACY_KEY);
        return store;
      }
    } catch {
      /* ignore */
    }
  }

  return { active: null, wallets: [] };
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

/** 保持している全ウォレット。 */
export function listWallets(): EncryptedWallet[] {
  return read().wallets;
}

/** 現在アクティブな公開アドレス（無効な active は先頭にフォールバック）。 */
export function getActiveAddress(): string | null {
  const s = read();
  if (s.active && s.wallets.some((w) => w.address === s.active)) return s.active;
  return s.wallets[0]?.address ?? null;
}

/** アクティブなウォレット（後方互換 API）。 */
export function getStoredWallet(): EncryptedWallet | null {
  const s = read();
  const addr = getActiveAddress();
  return s.wallets.find((w) => w.address === addr) ?? null;
}

/** 指定アドレスのウォレットを取得。 */
export function getWalletByAddress(address: string): EncryptedWallet | null {
  return read().wallets.find((w) => w.address === address) ?? null;
}

/** アクティブを切り替える（保持しているアドレスのみ有効）。 */
export function setActiveAddress(address: string): void {
  const s = read();
  if (s.wallets.some((w) => w.address === address)) {
    write({ active: address, wallets: s.wallets });
  }
}

/** ウォレットを追加（同一アドレスは置換）し、それをアクティブにする。 */
export function addWallet(wallet: EncryptedWallet): void {
  if (typeof window === "undefined" || !isValid(wallet)) return;
  const s = read();
  const others = s.wallets.filter((w) => w.address !== wallet.address);
  write({ active: wallet.address, wallets: [...others, wallet] });
}

/** 後方互換: 追加してアクティブ化（旧 saveStoredWallet と同じ呼び出し側で利用）。 */
export function saveStoredWallet(wallet: EncryptedWallet): void {
  addWallet(wallet);
}

/** 指定アドレスを削除。アクティブだった場合は残りの先頭へ移す。 */
export function removeWallet(address: string): void {
  const s = read();
  const wallets = s.wallets.filter((w) => w.address !== address);
  let active = s.active;
  if (active === address) active = wallets[0]?.address ?? null;
  write({ active, wallets });
}

/** 後方互換: アクティブなウォレットを削除する。 */
export function clearStoredWallet(): void {
  const addr = getActiveAddress();
  if (addr) removeWallet(addr);
}

/** 全ウォレットを削除する。 */
export function clearAllWallets(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORE_KEY);
}
