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

// ノードURL一覧（NEXT_PUBLIC_SYMBOL_NODE_URL をカンマ区切りで複数指定可能）。
export function getNodeUrls(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_SYMBOL_NODE_URL ??
    "https://sym-test-01.opening-line.jp:3001";
  const urls = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return urls.length > 0 ? urls : ["https://sym-test-01.opening-line.jp:3001"];
}

export function getNodeUrl(): string {
  return getNodeUrls()[0];
}

/**
 * 複数ノードに順次フェイルオーバーする fetch。
 * - ネットワークエラー / 5xx / タイムアウト → 次のノードへ
 * - 2xx / 4xx → そのまま返す（4xx は「正当な応答」として呼び出し側で処理）
 */
export async function nodeFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const urls = getNodeUrls();
  let lastError: unknown;
  for (const base of urls) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(8000),
        ...init,
      });
      if (res.status >= 500) {
        lastError = new Error(`node ${base} responded ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError ?? new Error("全ノードへの接続に失敗しました");
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
  const res = await nodeFetch(`/network/properties`);
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
  const res = await nodeFetch(`/accounts/${address}`);
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

// 送金手数料の概算バッファ（maxFee は ~0.02XYM 程度。余裕を持たせる）。
export const FEE_BUFFER_XYM = 0.1;

/**
 * 送金前の残高チェック。残高（手数料バッファ込み）が不足していれば警告文を返す。
 * 足りていれば null。残高取得に失敗した場合はブロックしない（送信時に判明するため null）。
 */
export async function checkSufficientBalance(
  address: string,
  amountXym: number
): Promise<string | null> {
  let balance: number;
  try {
    balance = await fetchXymBalance(address);
  } catch {
    return null;
  }
  const needed = amountXym + FEE_BUFFER_XYM;
  if (balance < needed) {
    const fmt = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
    return `残高が不足しています（必要 約${fmt(needed)} XYM / 残高 ${fmt(balance)} XYM）。送金額に加えてネットワーク手数料が必要です。`;
  }
  return null;
}
