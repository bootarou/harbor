import { signIn } from "next-auth/react";
import { accountFromPrivateKey, signChallenge } from "@/lib/wallet/symbol";

// 秘密鍵を使って DID ログインを行う（クライアント専用）。
// 1) アドレスでチャレンジ取得 → 2) 秘密鍵で署名 → 3) 署名のみ signIn 送信。
// 秘密鍵自体はサーバーへ送信しない。
export async function didLoginWithPrivateKey(
  privateKey: string
): Promise<{ ok: boolean; error?: string }> {
  const acc = accountFromPrivateKey(privateKey);

  const res = await fetch("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: acc.address }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: d?.error ?? "チャレンジの取得に失敗しました" };
  }
  const { challengeId, message } = (await res.json()) as {
    challengeId: string;
    message: string;
  };

  const { signature } = signChallenge(privateKey, message);

  const result = await signIn("did", {
    challengeId,
    address: acc.address,
    publicKey: acc.publicKey,
    signature,
    redirect: false,
  });
  if (!result || result.error) {
    return { ok: false, error: "署名認証に失敗しました" };
  }
  return { ok: true };
}
