// パージモード（NFC=物理鍵・ATM方式の一時アンロック）のセッション管理。
//
// 方式（A案: localStorage一時復元）:
// - NFCログイン時、暗号化ウォレットを通常どおり localStorage に復元する（既存フローがそのまま動く）。
// - パージモードでは「このセッションで新規に復元した口座」をログアウト時に削除し、端末から痕跡を消す。
// - 既存の他口座には影響させない。元から端末にあった口座は削除しない。
// - フラグ・対象アドレスは sessionStorage（UI表示・後始末用。秘密情報ではない）。タブを閉じれば消える。
//   平文の秘密鍵は一切保存しない（localStorage に置くのは従来どおり暗号化済みデータのみ）。
import { signOut } from "next-auth/react";
import { removeWallet } from "./storage";

const PURGE_FLAG_KEY = "nagexym.purge.v1"; // "1" = パージモードでログイン中
const PURGE_ADDR_KEY = "nagexym.purge.addr.v1"; // ログアウト時に削除する対象アドレス（新規復元時のみ）
const PURGE_EVENT = "nagexym:purge-changed";

/** パージモード変更イベント名（バッジ表示の購読用）。 */
export const PURGE_CHANGED_EVENT = PURGE_EVENT;

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PURGE_EVENT));
}

/** 現在パージモードでログイン中か。 */
export function isPurgeMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PURGE_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * パージセッションを開始する。
 * @param address 復元した口座の公開アドレス
 * @param addedByUs このログインで新規に localStorage へ追加したか
 *   （true のときだけログアウト時に削除する。元からあった口座は消さない）
 */
export function beginPurgeSession(address: string, addedByUs: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PURGE_FLAG_KEY, "1");
    if (addedByUs) window.sessionStorage.setItem(PURGE_ADDR_KEY, address);
    else window.sessionStorage.removeItem(PURGE_ADDR_KEY);
  } catch {
    /* sessionStorage 不可環境ではバッジ・自動削除が働かないだけ（鍵の安全性には影響しない） */
  }
  notify();
}

/**
 * パージセッションを終了する（ログアウト時の後始末）。
 * このセッションで新規復元した口座を localStorage から削除し、フラグを消す。
 */
export function endPurgeSession(): void {
  if (typeof window === "undefined") return;
  let addr: string | null = null;
  try {
    addr = window.sessionStorage.getItem(PURGE_ADDR_KEY);
  } catch {
    addr = null;
  }
  if (addr) removeWallet(addr);
  try {
    window.sessionStorage.removeItem(PURGE_FLAG_KEY);
    window.sessionStorage.removeItem(PURGE_ADDR_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/**
 * ログアウト共通処理。パージモード中なら後始末（端末から一時口座を削除）してから signOut する。
 * 通常モードでは何も削除せず signOut のみ。
 */
export async function purgeAwareSignOut(options?: {
  callbackUrl?: string;
}): Promise<void> {
  if (isPurgeMode()) endPurgeSession();
  await signOut(options);
}
