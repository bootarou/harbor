// XYM 金額の表示用フォーマット。
// 浮動小数の加算誤差（例: 16.900000000000002）を避けるため、
// XYM の最小単位（6桁）に丸めてから余分な末尾0を除去する。
export function formatXym(amount: number): string {
  return (Math.round(amount * 1_000_000) / 1_000_000).toString();
}
