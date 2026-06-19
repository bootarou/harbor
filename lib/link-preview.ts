import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchOgp } from "@/lib/ogp";
import { isOwnImageUrl, rehostOgImage } from "@/lib/og-image";

// ハイブリッド・リンクカード。
// - 保存時: 本文中の <a data-card> リンクの OGP を取得して LinkPreview に格納
//   （画像は自前ストレージへ再ホスト）。第三者由来の HTML は一切保存しない。
// - 表示時: 保存済み HTML（マーカー <a data-card> のみ）をサーバー側で
//   キャッシュからカード HTML に置換。各フィールドは必ずエスケープして埋め込む。

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日

// data-card 付きアンカーにマッチ（サニタイズ済みHTMLは入れ子の<a>を含まない）。
const anchorRe = (): RegExp => /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// HTML 群から data-card リンクの http(s) URL を重複排除して抽出。
function extractCardHrefs(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(anchorRe())) {
    if (!/\bdata-card\b/.test(m[1])) continue;
    const href = m[1].match(/href\s*=\s*"([^"]*)"/i)?.[1];
    if (!href) continue;
    const u = decodeEntities(href);
    if (/^https?:\/\//i.test(u)) set.add(u);
  }
  return [...set];
}

// 保存時: data-card リンクの OGP を取得・キャッシュ（TTL内は再取得しない）。
// 失敗は握りつぶす（表示時に通常リンクへフォールバックされる）。
export async function upsertLinkPreviewsFromHtml(
  htmls: string[]
): Promise<void> {
  const urls = extractCardHrefs(htmls.join("\n"));
  if (urls.length === 0) return;

  await Promise.allSettled(
    urls.map(async (url) => {
      const existing = await prisma.linkPreview.findUnique({ where: { url } });
      if (existing && Date.now() - existing.fetchedAt.getTime() < TTL_MS) {
        return;
      }
      let ogp;
      try {
        ogp = await fetchOgp(url);
      } catch {
        return; // 取得失敗時は更新しない（既存があればそのまま使う）
      }
      let image = ogp.imageUrl || null;
      if (image && !isOwnImageUrl(image)) {
        image = (await rehostOgImage(image)) ?? image;
      }
      const data = {
        title: ogp.title || null,
        description: ogp.description || null,
        image,
        siteName: ogp.siteName || null,
        fetchedAt: new Date(),
      };
      await prisma.linkPreview.upsert({
        where: { url },
        create: { url, ...data },
        update: data,
      });
    })
  );
}

type Preview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 信頼できるカード HTML を生成（各フィールドは esc 済み・自前テンプレート）。
function cardHtml(href: string, p: Preview): string {
  const title = esc(p.title ?? "");
  const desc = p.description ? esc(p.description) : "";
  const site = esc(p.siteName || hostOf(href));
  const hrefAttr = esc(href);
  const imageBlock = p.image
    ? `<span class="hidden w-[34%] shrink-0 self-stretch bg-gray-100 sm:block dark:bg-gray-800"><img src="${esc(
        p.image
      )}" alt="" class="h-full w-full object-cover" /></span>`
    : "";

  return (
    `<a href="${hrefAttr}" target="_blank" rel="noopener noreferrer nofollow" ` +
    `class="not-prose my-4 flex overflow-hidden rounded-lg border border-gray-200 no-underline transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700">` +
    `<span class="min-w-0 flex-1 p-3">` +
    `<span class="line-clamp-2 block font-semibold text-gray-900 dark:text-gray-100">${title}</span>` +
    (desc
      ? `<span class="mt-1 line-clamp-2 block text-xs text-gray-600 dark:text-gray-400">${desc}</span>`
      : "") +
    `<span class="mt-2 block truncate text-xs text-gray-400">${site}</span>` +
    `</span>` +
    imageBlock +
    `</a>`
  );
}

// 表示時: <a data-card> をキャッシュからカードHTMLへ置換。
// キャッシュが無い/タイトル無しは data-card を外した通常リンクにフォールバック。
export async function renderLinkCardsHtml(html: string): Promise<string> {
  if (!html || !html.includes("data-card")) return html;
  const urls = extractCardHrefs(html);
  if (urls.length === 0) return html;

  const rows = await prisma.linkPreview.findMany({ where: { url: { in: urls } } });
  const byUrl = new Map(rows.map((r) => [r.url, r]));

  return html.replace(anchorRe(), (full, attrs: string) => {
    if (!/\bdata-card\b/.test(attrs)) return full;
    const hrefRaw = attrs.match(/href\s*=\s*"([^"]*)"/i)?.[1];
    if (!hrefRaw) return full;
    const href = decodeEntities(hrefRaw);
    const p = byUrl.get(href);
    if (!p || !p.title) {
      return full.replace(/\s*data-card="[^"]*"/i, "");
    }
    return cardHtml(href, p);
  });
}
