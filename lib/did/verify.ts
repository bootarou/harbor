import "server-only";
import "@/lib/wallet/polyfill";
import { PublicAccount } from "symbol-sdk";
import { getNetworkType } from "@/lib/wallet/symbol";

// 公開鍵からアドレスを導出（サーバー側検証用）。
export function deriveAddressFromPublicKey(publicKey: string): string | null {
  try {
    return PublicAccount.createFromPublicKey(
      publicKey,
      getNetworkType()
    ).address.plain();
  } catch {
    return null;
  }
}

// 署名検証（公開鍵・メッセージ・署名）。
export function verifySignature(
  publicKey: string,
  message: string,
  signature: string
): boolean {
  try {
    return PublicAccount.createFromPublicKey(
      publicKey,
      getNetworkType()
    ).verifySignature(message, signature);
  } catch {
    return false;
  }
}
