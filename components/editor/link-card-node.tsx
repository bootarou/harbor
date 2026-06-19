"use client";

import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

// 編集中のリンクカード表示（NodeView）。
// 保存される HTML はマーカー <a data-card href> のみ（renderHTML 参照）。
// タイトル等は編集表示用の一時属性で、無ければ /api/ogp で取得して表示する。
function LinkCardView({ node, editor, getPos }: NodeViewProps) {
  const href = (node.attrs.href as string) || "";
  const [meta, setMeta] = useState({
    title: (node.attrs.title as string) || "",
    description: (node.attrs.description as string) || "",
    image: (node.attrs.image as string) || "",
    siteName: (node.attrs.siteName as string) || "",
  });
  // 取得が必要（href あり・タイトル未取得）なら初期から loading 表示。
  const [loading, setLoading] = useState(
    () => !!href && !(node.attrs.title as string)
  );

  useEffect(() => {
    if (!href || meta.title) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ogp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: href }),
        });
        const data = (await res.json().catch(() => null)) as {
          ogp?: {
            title: string;
            description: string;
            imageUrl: string;
            siteName: string;
          };
        } | null;
        if (!cancelled && data?.ogp) {
          setMeta({
            title: data.ogp.title,
            description: data.ogp.description,
            image: data.ogp.imageUrl,
            siteName: data.ogp.siteName,
          });
        }
      } catch {
        // 取得失敗時は URL のみ表示
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [href, meta.title]);

  function remove() {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  }

  let host = href;
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* noop */
  }

  return (
    <NodeViewWrapper className="not-prose my-3" data-drag-handle>
      <div className="relative flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="min-w-0 flex-1 p-3">
          <p className="line-clamp-2 text-sm font-semibold">
            {meta.title || (loading ? "読み込み中…" : href)}
          </p>
          {meta.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
              {meta.description}
            </p>
          )}
          <p className="mt-2 truncate text-xs text-gray-400">
            {meta.siteName || host}
          </p>
        </div>
        {meta.image && (
          <div className="hidden w-[34%] shrink-0 self-stretch bg-gray-100 sm:block dark:bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meta.image}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <button
          type="button"
          onClick={remove}
          title="リンクカードを削除"
          className="absolute right-1 top-1 rounded bg-black/50 px-1.5 text-xs text-white hover:bg-black/70"
        >
          ✕
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export type LinkCardAttrs = {
  href: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    linkCard: {
      insertLinkCard: (attrs: LinkCardAttrs) => ReturnType;
    };
  }
}

export const LinkCard = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: null },
      // 以下は編集表示用の一時属性。renderHTML には出さない（保存HTMLは最小化）。
      title: { default: "", rendered: false },
      description: { default: "", rendered: false },
      image: { default: "", rendered: false },
      siteName: { default: "", rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-card]",
        priority: 1000, // Link マークより優先してノードとして取り込む
        getAttrs: (el) =>
          el instanceof HTMLElement ? { href: el.getAttribute("href") } : false,
      },
    ];
  },

  renderHTML({ node }) {
    // 保存されるのはマーカーのみ: <a data-card href>URL</a>
    return [
      "a",
      mergeAttributes({
        "data-card": "true",
        href: node.attrs.href,
      }),
      node.attrs.href ?? "",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView);
  },

  addCommands() {
    return {
      insertLinkCard:
        (attrs: LinkCardAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
