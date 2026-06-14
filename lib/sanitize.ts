import "server-only";
import sanitizeHtmlLib from "sanitize-html";

// Tiptap が出力する HTML を許可リスト方式でサニタイズする（XSS 対策）。
// 保存時に必ず通し、DB には常にサニタイズ済みの HTML のみを格納する。
const options: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  // http/https/mailto と相対パス（/uploads/...）のみ許可。javascript: 等は除去される。
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  allowProtocolRelative: false,
  // リンクには安全な rel を強制付与。
  transformTags: {
    a: (tagName, attribs) => {
      return {
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      };
    },
  },
};

export function sanitizePostHtml(dirty: string): string {
  return sanitizeHtmlLib(dirty, options);
}

// 一覧の抜粋用に、HTML からプレーンテキストを抽出して切り詰める。
export function htmlToText(html: string, maxLength = 140): string {
  const text = sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}
