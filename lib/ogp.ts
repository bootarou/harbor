import "server-only";

// 外部URLから OGP 情報を取得する。SSRF 対策として http/https のみ・
// ローカル/プライベートっぽいホストを拒否し、サイズ/時間を制限する。

export type Ogp = {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
};

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // 明確なプライベートIP帯（ベストエフォート）
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

export class OgpError extends Error {}

// YouTube URL から動画IDを抽出（watch / youtu.be / shorts / embed / live）。
function youTubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v") ?? "";
      return /^[\w-]{11}$/.test(v) ? v : null;
    }
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

// 16:9 のサムネイルを返す（hqdefault は 4:3 で黒帯が入るため使わない）。
// maxresdefault(1280x720) があればそれ、無ければ mqdefault(320x180)。どちらも 16:9。
async function bestYouTubeThumb(id: string): Promise<string> {
  const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try {
    const r = await fetch(maxres, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) return maxres;
  } catch {
    // フォールバックへ
  }
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

// YouTube 専用: oEmbed でタイトル取得＋16:9サムネイルでリンクカードを生成。
async function fetchYouTube(parsed: URL, id: string): Promise<Ogp> {
  let title = "";
  let author = "";
  try {
    const o = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.toString())}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (o.ok) {
      const d = (await o.json()) as { title?: string; author_name?: string };
      title = (d.title ?? "").trim();
      author = (d.author_name ?? "").trim();
    }
  } catch {
    // oEmbed 失敗時はサムネイルのみで生成
  }
  const imageUrl = await bestYouTubeThumb(id);
  return {
    url: parsed.toString(),
    title: (title || "YouTube 動画").slice(0, 300),
    description: (author ? `YouTube · ${author}` : "YouTube").slice(0, 600),
    imageUrl: imageUrl.slice(0, 2048),
    siteName: "YouTube",
  };
}

function metaContent(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

// og:プロパティ用に property/content 両順序に対応した正規表現を作る。
function ogPatterns(prop: string): RegExp[] {
  return [
    new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`,
      "i"
    ),
  ];
}

export async function fetchOgp(rawUrl: string): Promise<Ogp> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new OgpError("URLの形式が正しくありません");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OgpError("http/https のURLのみ対応しています");
  }
  // YouTube は専用処理（OGPスクレイピングではなく動画ID＋oEmbed＋サムネイル）
  const ytId = youTubeId(parsed);
  if (ytId) {
    return fetchYouTube(parsed, ytId);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new OgpError("このURLは取得できません");
  }

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "HarborBot/1.0 (+OGP)" },
    });
  } catch {
    throw new OgpError("ページを取得できませんでした");
  }
  if (!res.ok) {
    throw new OgpError(`ページ取得に失敗しました (${res.status})`);
  }

  // HTML の先頭のみ読む（最大 ~512KB）。
  const reader = res.body?.getReader();
  let html = "";
  if (reader) {
    const decoder = new TextDecoder();
    let total = 0;
    const MAX = 512 * 1024;
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break; // head まで取れれば十分
    }
    await reader.cancel().catch(() => {});
  } else {
    html = (await res.text()).slice(0, 512 * 1024);
  }

  const title =
    metaContent(html, ogPatterns("og:title")) ||
    decodeEntities((/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim());
  const description =
    metaContent(html, ogPatterns("og:description")) ||
    metaContent(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ]);
  let imageUrl = metaContent(html, ogPatterns("og:image"));
  const siteName =
    metaContent(html, ogPatterns("og:site_name")) || parsed.hostname;

  // 画像URLは http/https のみ採用（相対は絶対化）。
  if (imageUrl) {
    try {
      const abs = new URL(imageUrl, parsed);
      imageUrl =
        abs.protocol === "http:" || abs.protocol === "https:"
          ? abs.toString()
          : "";
    } catch {
      imageUrl = "";
    }
  }

  return {
    url: parsed.toString(),
    title: title.slice(0, 300),
    description: description.slice(0, 600),
    imageUrl: imageUrl.slice(0, 2048),
    siteName: siteName.slice(0, 200),
  };
}
