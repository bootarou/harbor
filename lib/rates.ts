import "server-only";

// XYM/JPY レート取得（税務の円換算用）。記録時点のレートを取引に保存する。
// 既定は CoinGecko。テスト等で差し替えられるよう URL を環境変数で上書き可能。
const RATE_URL =
  process.env.XYM_JPY_RATE_URL ||
  "https://api.coingecko.com/api/v3/simple/price?ids=symbol&vs_currencies=jpy";

let cache: { rate: number; at: number } | null = null;
const TTL_MS = 60_000;

export async function fetchXymJpyRate(): Promise<number | null> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.rate;
  }
  try {
    const res = await fetch(RATE_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return cache?.rate ?? null;
    const data = (await res.json()) as { symbol?: { jpy?: number } };
    const rate = data.symbol?.jpy;
    if (typeof rate === "number" && rate > 0) {
      cache = { rate, at: Date.now() };
      return rate;
    }
    return cache?.rate ?? null;
  } catch {
    return cache?.rate ?? null;
  }
}
