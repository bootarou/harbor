/**
 * ログイン・登録後の戻り先 URL を安全な範囲に丸める。
 *
 * router.push() は絶対URLを渡すと外部サイトへ遷移するため、
 * ?callbackUrl= をそのまま使うとオープンリダイレクトになる。
 * 同一オリジンの相対パスだけを通す。
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  // "/" で始まらないものは絶対URL・スキーム付き（https:, javascript: 等）。
  if (!raw.startsWith("/")) return fallback;
  // "//evil.com" はプロトコル相対URL。"/\evil.com" も同様に扱うブラウザがある。
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
