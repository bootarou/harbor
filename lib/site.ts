// 公開サイトの絶対URL基点を決める。
// OG/Twitter カードの画像・URL は絶対URL（公開ドメイン）である必要がある。
// 優先順: NEXT_PUBLIC_SITE_URL → AUTH_URL（プロキシ/トンネル下で公開URLを設定済みのことが多い）。
// localhost/127.0.0.1 は外部クローラーが取得できないため避ける。
function isPublic(u: string | undefined): u is string {
  return (
    !!u &&
    /^https?:\/\//.test(u) &&
    !u.includes("localhost") &&
    !u.includes("127.0.0.1")
  );
}

export function siteBaseUrl(): string {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.AUTH_URL];
  for (const c of candidates) {
    if (isPublic(c)) return c.replace(/\/$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

// 相対パス/絶対URL を絶対URLへ正規化する。
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = siteBaseUrl();
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
