// 端末間転送（QRコード / NFC タグ）用の暗号化ウォレットのシリアライズ・復元。
// 重要: 転送するのは「既存の暗号化フォーマット（version/address/salt/iv/ciphertext）」のみ。
// 秘密鍵の平文・ニーモニック・パスフレーズは絶対に含めない（暗号化済みデータだけ）。
// 受信側でパスフレーズによる復号が別途必要なため、データ単体が漏れても鍵は使えない。
import type { EncryptedWallet } from "./crypto";

const ADDRESS_RE = /^[A-Z2-7]{39}$/;

/**
 * 暗号化ウォレットを転送用 JSON 文字列にする。
 * NFC 専用の新フォーマットは作らず、既存の暗号化フォーマットをそのまま JSON 化する。
 */
export function serializeWalletForTransfer(wallet: EncryptedWallet): string {
  const payload: EncryptedWallet = {
    version: wallet.version,
    address: wallet.address,
    salt: wallet.salt,
    iv: wallet.iv,
    ciphertext: wallet.ciphertext,
  };
  return JSON.stringify(payload);
}

/**
 * QR/NFC から読み取った文字列を検証して EncryptedWallet に復元する。
 * 形式が不正なら例外を投げる（保存はしない）。
 */
export function parseTransferredWallet(text: string): EncryptedWallet {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error(
      "読み取ったデータがウォレット形式ではありません（JSONとして解釈できません）。"
    );
  }
  if (!obj || typeof obj !== "object") {
    throw new Error("読み取ったデータの形式が不正です。");
  }
  const w = obj as Record<string, unknown>;
  if (
    w.version !== 1 ||
    typeof w.address !== "string" ||
    typeof w.salt !== "string" ||
    typeof w.iv !== "string" ||
    typeof w.ciphertext !== "string" ||
    w.salt.length === 0 ||
    w.iv.length === 0 ||
    w.ciphertext.length === 0
  ) {
    throw new Error("これは Harbor の暗号化ウォレットデータではありません。");
  }
  if (!ADDRESS_RE.test(w.address)) {
    throw new Error("ウォレットのアドレス形式が正しくありません。");
  }
  return {
    version: 1,
    address: w.address,
    salt: w.salt,
    iv: w.iv,
    ciphertext: w.ciphertext,
  };
}
