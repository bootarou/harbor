// YouTube URL から動画ID(11桁)を抽出する純粋関数（クライアント/サーバー両用）。
// watch?v= / youtu.be/ / shorts/ / embed/ / live/ に対応。
export function youtubeEmbedId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const valid = (id: string) => (/^[\w-]{11}$/.test(id) ? id : null);

  if (host === "youtu.be") {
    return valid(u.pathname.slice(1).split("/")[0] ?? "");
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      return valid(u.searchParams.get("v") ?? "");
    }
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

// プライバシー強化モードの埋め込みURL。
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
