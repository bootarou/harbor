import "server-only";

export type TocEntry = { level: number; text: string; id: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// 記事HTMLの h1/h2/h3 に id を注入し、目次エントリを返す。
// id は見出し順のインデックス（toc-0, toc-1, …）にして衝突を避ける
// （日本語見出しでもアンカーが確実に機能する）。本文は既にサニタイズ済み。
export function buildToc(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  let i = 0;
  const out = html.replace(
    /<(h[123])(\b[^>]*?)>([\s\S]*?)<\/\1>/gi,
    (full: string, tag: string, attrs: string, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return full;
      // 既に id があればそれを使い、無ければ付与する。
      const existing = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs);
      if (existing) {
        toc.push({ level: Number(tag[1]), text, id: existing[1] });
        i++;
        return full;
      }
      const id = `toc-${i}`;
      i++;
      toc.push({ level: Number(tag[1]), text, id });
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    }
  );
  return { html: out, toc };
}
