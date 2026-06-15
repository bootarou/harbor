// ローカル鍵暗号化（Web Crypto API のみ使用）。
// PBKDF2 で鍵導出 → AES-256-GCM で秘密鍵(hex)を暗号化する。
// 秘密鍵・パスフレーズはこのモジュールの外（サーバー等）へは一切渡さない。
// 仕様書 §5 の保存フォーマットに準拠。

export type EncryptedWallet = {
  version: 1;
  address: string; // 公開アドレス（参考表示用）
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64（AES-256-GCM で暗号化された秘密鍵 hex）
};

const PBKDF2_ITERATIONS = 300_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

// Web Crypto(crypto.subtle) は secure context（HTTPS または localhost）でのみ利用可能。
// http://<LAN-IP> 等の非セキュアコンテキストでは undefined になり暗号化/復号に失敗する。
export class WebCryptoUnavailableError extends Error {
  constructor() {
    super(
      "この接続では暗号化機能(Web Crypto)が使えません。HTTPS でアクセスしてください（http://192.168.x.x のようなLAN接続では動作しません）。"
    );
    this.name = "WebCryptoUnavailableError";
  }
}

function assertWebCrypto(): void {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.subtle === "undefined" ||
    typeof crypto.subtle.importKey !== "function"
  ) {
    throw new WebCryptoUnavailableError();
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Web Crypto は ArrayBuffer 裏付けの BufferSource を要求するため、確実に ArrayBuffer へ変換する。
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(enc.encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 秘密鍵(hex) をパスフレーズで暗号化する。
 */
export async function encryptPrivateKey(
  privateKeyHex: string,
  passphrase: string,
  address: string
): Promise<EncryptedWallet> {
  assertWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(enc.encode(privateKeyHex))
  );

  return {
    version: 1,
    address,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("パスフレーズが正しくありません");
    this.name = "WrongPassphraseError";
  }
}

/**
 * 暗号化済みウォレットをパスフレーズで復号し、秘密鍵(hex) を返す。
 * 復号結果は呼び出し側のメモリ上にのみ保持し、永続化しないこと。
 */
export async function decryptPrivateKey(
  wallet: EncryptedWallet,
  passphrase: string
): Promise<string> {
  assertWebCrypto();
  const salt = base64ToBytes(wallet.salt);
  const iv = base64ToBytes(wallet.iv);
  const key = await deriveAesKey(passphrase, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(base64ToBytes(wallet.ciphertext))
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // GCM 認証失敗＝パスフレーズ誤り（または改ざん）。
    throw new WrongPassphraseError();
  }
}
