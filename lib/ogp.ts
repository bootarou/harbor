import "server-only";
import { lookup } from "node:dns/promises";

// 外部URLから OGP 情報を取得する。SSRF 対策として:
// - http/https のみ許可
// - ホスト名を実際に DNS 解決し、解決された全 IP がプライベート/ループバック/
//   リンクローカル/予約帯でないことを確認（DNS リバインディング型を防ぐ）
// - リダイレクトは手動追従し、各ホップで上記検証を再実行（リダイレクト経由の回避を防ぐ）
// - サイズ/時間/リダイレクト回数を制限する

export type Ogp = {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
};

export class OgpError extends Error {}

// 明らかにローカル/内部を指すホスト名を文字列段階で拒否（DNS 解決前の早期弾き）。
function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  );
}

// IPv4 文字列を 32bit 整数へ（ドット10進のみ。dns.lookup の返り値は正規化済み）。
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // パースできない＝安全側で拒否
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) || // "this" network
    inRange("10.0.0.0", 8) || // private
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local（クラウドメタデータ含む）
    inRange("172.16.0.0", 12) || // private
    inRange("192.0.0.0", 24) ||
    inRange("192.0.2.0", 24) ||
    inRange("192.88.99.0", 24) ||
    inRange("192.168.0.0", 16) || // private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("198.51.100.0", 24) ||
    inRange("203.0.113.0", 24) ||
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved（255.255.255.255 含む）
  );
}

function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase().split("%")[0]; // ゾーンID除去
  // IPv4-mapped / IPv4-compatible（::ffff:a.b.c.d 等）は埋め込み IPv4 を判定。
  const mapped = /(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/i.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (h === "::" || h === "::1") return true; // unspecified / loopback
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (/^f[cd]/.test(h)) return true; // fc00::/7 unique local
  if (h.startsWith("ff")) return true; // ff00::/8 multicast
  return false;
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

// ホスト名を DNS 解決し、解決された全 IP が公開アドレスであることを確認する。
// 1つでもプライベート/予約帯があれば拒否（DNS リバインディング対策）。
async function assertPublicHost(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new OgpError("このURLは取得できません");
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new OgpError("ホスト名を解決できませんでした");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new OgpError("このURLは取得できません");
  }
}

// SSRF 安全な fetch。各ホップでホストを再検証し、リダイレクトは手動追従する。
async function safeFetch(
  startUrl: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = 4, ...rest } = init;
  let current = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new OgpError("URLの形式が正しくありません");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new OgpError("http/https のURLのみ対応しています");
    }
    await assertPublicHost(parsed.hostname);

    const res = await fetch(parsed.toString(), { ...rest, redirect: "manual" });

    // リダイレクト以外はそのまま返す。
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    // 次のホップへ（相対 Location を絶対化）。bodyを破棄。
    await res.body?.cancel().catch(() => {});
    current = new URL(location, parsed).toString();
  }
  throw new OgpError("リダイレクトが多すぎます");
}

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

// TikTok URL から動画ID(数値)を抽出（/@user/video/{id} / /v/{id}.html / /embed / /player）。
function tikTokId(u: URL): string | null {
  const host = u.hostname.replace(/^(www\.|m\.|vt\.|vm\.)/, "");
  if (host !== "tiktok.com") return null;
  const m =
    u.pathname.match(/\/video\/(\d{6,30})/) ??
    u.pathname.match(/^\/v\/(\d{6,30})/) ??
    u.pathname.match(/^\/embed(?:\/v2)?\/(\d{6,30})/) ??
    u.pathname.match(/^\/player\/v1\/(\d{6,30})/);
  return m ? m[1] : null;
}

// TikTok は JS レンダリングのため og:image をスクレイピングできない。
// oEmbed でタイトル・著者・サムネイルを取得してリンクカードを生成する。
async function fetchTikTok(parsed: URL): Promise<Ogp> {
  let title = "";
  let author = "";
  let imageUrl = "";
  try {
    const o = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.toString())}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (o.ok) {
      const d = (await o.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      title = (d.title ?? "").trim();
      author = (d.author_name ?? "").trim();
      imageUrl = (d.thumbnail_url ?? "").trim();
    }
  } catch {
    // oEmbed 失敗時はメタ情報なしで生成
  }
  return {
    url: parsed.toString(),
    title: (title || "TikTok 動画").slice(0, 300),
    description: (author ? `TikTok · ${author}` : "TikTok").slice(0, 600),
    imageUrl: imageUrl.slice(0, 2048),
    siteName: "TikTok",
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
  // TikTok も専用処理（oEmbed でタイトル＋著者＋サムネイル取得）。
  // 短縮URL（vm./vt.tiktok.com）はIDを含まないが oEmbed が解決するため host で判定。
  if (
    /(?:^|\.)tiktok\.com$/.test(parsed.hostname.replace(/^www\./, "")) ||
    tikTokId(parsed)
  ) {
    return fetchTikTok(parsed);
  }

  // SSRF 対策: DNS 解決して全 IP を検証し、リダイレクトは手動追従で各ホップ再検証する。
  let res: Response;
  try {
    res = await safeFetch(parsed.toString(), {
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "HarborBot/1.0 (+OGP)" },
    });
  } catch (e) {
    if (e instanceof OgpError) throw e;
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
      // head まで取れれば十分。ただし Next.js/React19 等のストリーミングSSRでは
      // 先頭シェルに早期の </head> が現れ、og:title 等は後から流れてくるため、
      // タイトル系を取得済みのときだけ打ち切る（未取得なら MAX まで読み続ける）。
      if (/<\/head>/i.test(html) && /og:title|<title[\s>]/i.test(html)) break;
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

// 再ホスト用の画像取得サイズ上限（DoS対策のハードキャップ）。
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

// 外部の og:image を SSRF 安全に取得する（自前ストレージへ再ホストする用途）。
// - safeFetch によりホスト検証・リダイレクト各ホップ再検証・http/https 限定
// - content-type が image/* でなければ拒否、サイズ上限あり
// - GitHub 等は動的生成のため一時的に 429 を返すことがあり、1回だけ再試行する
// 失敗時は null を返す（呼び出し側は元の外部URLにフォールバックする想定）。
export async function fetchRemoteImageSafe(
  rawUrl: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await safeFetch(rawUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          // 動的生成サービス（GitHub 等）はブラウザ風 UA の方が安定する。
          "User-Agent":
            "Mozilla/5.0 (compatible; HarborBot/1.0; +OGP image fetch)",
          Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        },
      });
    } catch {
      return null;
    }
    if (res.status === 429 && attempt === 0) {
      await res.body?.cancel().catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      continue; // 一時的なレート制限のみ1回だけ再試行
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const contentType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    return { buffer: Buffer.concat(chunks), contentType };
  }
  return null;
}
