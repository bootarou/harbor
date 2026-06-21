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

// 公開ドメインは外部クローラー向けに常に https へ正規化する。
// http の og:image / twitter:image は X(Twitter) 等のカードで無視され画像が出ないため。
// （本番は Cloudflare 等で TLS 終端され https 配信の前提。localhost は対象外。）
function toHttpsIfPublic(u: string): string {
  return u.replace(/^http:\/\//i, "https://");
}

export function siteBaseUrl(): string {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.AUTH_URL];
  for (const c of candidates) {
    if (isPublic(c)) return toHttpsIfPublic(c).replace(/\/$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

// 相対パス/絶対URL を絶対URLへ正規化する。
// 既に絶対URLでも、公開ドメインの http は https へ正規化する（OGカード画像対策）。
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) {
    return isPublic(pathOrUrl) ? toHttpsIfPublic(pathOrUrl) : pathOrUrl;
  }
  const base = siteBaseUrl();
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
