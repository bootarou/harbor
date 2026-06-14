// 暗号化済みウォレットの localStorage 入出力（ブラウザのみ）。
// 保存するのは暗号化済みデータ（salt/iv/ciphertext）と公開アドレスのみ。
import type { EncryptedWallet } from "./crypto";

const STORAGE_KEY = "nagexym.wallet.v1";

export function getStoredWallet(): EncryptedWallet | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as EncryptedWallet;
    if (parsed.version !== 1 || !parsed.ciphertext || !parsed.address) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredWallet(wallet: EncryptedWallet): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
}

export function clearStoredWallet(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}
