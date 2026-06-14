// Symbol DID 共通ヘルパー（クライアント・サーバー両用、symbol-sdk 非依存）。

export function getNetworkName(): "testnet" | "mainnet" {
  return process.env.NEXT_PUBLIC_SYMBOL_NETWORK === "mainnet"
    ? "mainnet"
    : "testnet";
}

export function addressToDid(
  address: string,
  network: string = getNetworkName()
): string {
  return `did:symbol:${network}:${address}`;
}

// アドレスを短縮表示（既定の表示名などに使用）。
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// 期待されるネットワークのアドレス先頭文字（testnet=T / mainnet=N）。
export function networkAddressPrefix(
  network: string = getNetworkName()
): string {
  return network === "mainnet" ? "N" : "T";
}
