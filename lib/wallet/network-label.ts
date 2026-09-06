/**
 * 表示用のネットワーク名（"mainnet" / "testnet"）。
 * getNetworkType() は symbol-sdk の enum を返すため、
 * 人が読むファイルや画面にはこちらを使う。
 */
export const SYMBOL_NETWORK_LABEL =
  process.env.NEXT_PUBLIC_SYMBOL_NETWORK ?? "testnet";
