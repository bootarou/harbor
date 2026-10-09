/**
 * ログイン・登録後の戻り先 URL を安全な範囲に丸める。
 *
 * router.push() は絶対URLを渡すと外部サイトへ遷移するため、
 * ?callbackUrl= をそのまま使うとオープンリダイレクトになる。
 *
 * 文字列の見た目では判定しない。ブラウザの URL パーサはタブ・改行を
 * 除去するので、"/\t/evil.com" は文字列上は "/" 始まりの相対パスに
 * 見えても、解析後は "//evil.com"（外部）になる。
 * そこで実際に URL として解析し、同一オリジンに留まるかで判定する。
 * 返すのも解析後の正規化済みパスにし、判定した値と遷移する値を一致させる。
 */

// 判定用の架空のオリジン。どこにも接続しない（.invalid は予約済みTLD）。
const BASE = "http://callback.invalid";

export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  // "/" で始まらないものは絶対URL・スキーム付き（https:, javascript: 等）。
  if (!raw.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  // 解析した結果、別のオリジンを指していれば外部への遷移。
  if (url.origin !== BASE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
