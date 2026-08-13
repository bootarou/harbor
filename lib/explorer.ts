// Symbol ブロックエクスプローラーのURL生成（ネットワーク対応）。
// ベースは NEXT_PUBLIC_SYMBOL_NETWORK（testnet/mainnet）で切替。
// NEXT_PUBLIC_SYMBOL_EXPLORER_URL があればそれで上書きする（別エクスプローラーへの差替用）。
// ※ NEXT_PUBLIC_* はビルド時に焼き込まれるため、値を変えたら再ビルドが必要。
export function explorerBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_SYMBOL_EXPLORER_URL;
  if (override) return override.replace(/\/$/, "");
  const isMainnet = process.env.NEXT_PUBLIC_SYMBOL_NETWORK === "mainnet";
  return isMainnet ? "https://symbol.fyi" : "https://testnet.symbol.fyi";
}

export function explorerTxUrl(hash: string): string {
  return `${explorerBaseUrl()}/transactions/${hash}`;
}
