import "./polyfill"; // Buffer を symbol import より前に用意する
import { Account, NetworkType } from "symbol-sdk";
import {
  ExtendedKey,
  MnemonicPassPhrase,
  Network,
  Wallet,
} from "symbol-hd-wallets";

// Symbol HD ウォレット（BIP44, coin type 4343）の鍵導出。
// 鍵・ニーモニックは呼び出し側（クライアント）のメモリ上にのみ存在させる。
const DERIVATION_PATH = "m/44'/4343'/0'/0'/0'";

export type DerivedAccount = {
  privateKey: string; // hex（メモリ上のみ。サーバー送信・保存禁止）
  publicKey: string;
  address: string; // 公開アドレス（plain 39文字）
};

export function getNetworkType(): NetworkType {
  const net = process.env.NEXT_PUBLIC_SYMBOL_NETWORK ?? "testnet";
  return net === "mainnet" ? NetworkType.MAIN_NET : NetworkType.TEST_NET;
}

export function getNodeUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SYMBOL_NODE_URL ??
    "https://sym-test-01.opening-line.jp:3001"
  );
}

/** 24語の BIP39 ニーモニックを新規生成する。 */
export function generateMnemonic(): string {
  return MnemonicPassPhrase.createRandom().plain;
}

/** ニーモニック文字列の形式が妥当か（12/24語）を判定する。 */
export function isValidMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    return false;
  }
  try {
    deriveAccount(mnemonic);
    return true;
  } catch {
    return false;
  }
}

/** ニーモニックからアカウント（秘密鍵・公開鍵・アドレス）を導出する。 */
export function deriveAccount(mnemonic: string): DerivedAccount {
  const passphrase = new MnemonicPassPhrase(mnemonic.trim());
  const seed = passphrase.toSeed().toString("hex");
  const extendedKey = ExtendedKey.createFromSeed(seed, Network.SYMBOL);
  const wallet = new Wallet(extendedKey);
  const privateKey = wallet.getChildAccountPrivateKey(DERIVATION_PATH);
  return accountFromPrivateKey(privateKey);
}

/**
 * DID ログインのため、秘密鍵でチャレンジメッセージに署名する（クライアントで実行）。
 * 返すのは公開鍵・アドレス・署名のみ（秘密鍵は返さない）。
 */
export function signChallenge(
  privateKeyHex: string,
  message: string
): { address: string; publicKey: string; signature: string } {
  const account = Account.createFromPrivateKey(privateKeyHex, getNetworkType());
  return {
    address: account.address.plain(),
    publicKey: account.publicKey,
    signature: account.signData(message),
  };
}

/** 秘密鍵(hex) から公開鍵・アドレスを導出する。 */
export function accountFromPrivateKey(privateKeyHex: string): DerivedAccount {
  const account = Account.createFromPrivateKey(
    privateKeyHex,
    getNetworkType()
  );
  return {
    privateKey: account.privateKey,
    publicKey: account.publicKey,
    address: account.address.plain(),
  };
}

// --- 残高取得（読み取り専用 / 秘密鍵不要、REST API を直接叩く） ---

let cachedCurrencyMosaicId: string | null = null;

export async function getCurrencyMosaicId(): Promise<string> {
  if (cachedCurrencyMosaicId) {
    return cachedCurrencyMosaicId;
  }
  const res = await fetch(`${getNodeUrl()}/network/properties`);
  if (!res.ok) {
    throw new Error("ネットワーク情報の取得に失敗しました");
  }
  const data = (await res.json()) as {
    chain?: { currencyMosaicId?: string };
  };
  const raw = data.chain?.currencyMosaicId ?? "";
  // "0x72C0'212E'67A0'8BCE" -> "72C0212E67A08BCE"
  cachedCurrencyMosaicId = raw
    .replace(/^0x/i, "")
    .replace(/'/g, "")
    .toUpperCase();
  return cachedCurrencyMosaicId;
}

/** 指定アドレスの XYM 残高を取得する（未着金/未作成アカウントは 0）。 */
export async function fetchXymBalance(address: string): Promise<number> {
  const currencyId = await getCurrencyMosaicId();
  const res = await fetch(`${getNodeUrl()}/accounts/${address}`);
  if (res.status === 404) {
    return 0;
  }
  if (!res.ok) {
    throw new Error("残高の取得に失敗しました");
  }
  const data = (await res.json()) as {
    account?: { mosaics?: { id: string; amount: string }[] };
  };
  const mosaics = data.account?.mosaics ?? [];
  const xym = mosaics.find((m) => m.id.toUpperCase() === currencyId);
  if (!xym) {
    return 0;
  }
  // XYM の divisibility は 6。
  return Number(xym.amount) / 1_000_000;
}
