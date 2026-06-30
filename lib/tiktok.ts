// TikTok URL から動画ID(数値)を抽出する純粋関数（クライアント/サーバー両用）。
// /@user/video/{id} / /v/{id}.html / /embed/v2/{id} / /player/v1/{id} に対応。
// 短縮URL（vm.tiktok.com 等）はIDを含まないため null を返す。
export function tiktokEmbedId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|vt\.|vm\.)/, "");
  if (host !== "tiktok.com") return null;

  const valid = (id: string) => (/^\d{6,30}$/.test(id) ? id : null);

  // /@user/video/{id}
  let m = u.pathname.match(/\/video\/(\d{6,30})/);
  if (m) return valid(m[1]);
  // /v/{id}.html
  m = u.pathname.match(/^\/v\/(\d{6,30})/);
  if (m) return valid(m[1]);
  // /embed/v2/{id} / /embed/{id}
  m = u.pathname.match(/^\/embed(?:\/v2)?\/(\d{6,30})/);
  if (m) return valid(m[1]);
  // /player/v1/{id}
  m = u.pathname.match(/^\/player\/v1\/(\d{6,30})/);
  if (m) return valid(m[1]);

  return null;
}

// TikTok 公式 iframe プレイヤーの埋め込みURL（縦型 9:16）。
export function tiktokEmbedUrl(id: string): string {
  return `https://www.tiktok.com/player/v1/${id}`;
}
