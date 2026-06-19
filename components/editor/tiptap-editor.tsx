"use client";

import { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { LinkCard } from "@/components/editor/link-card-node";

type Props = {
  initialHTML?: string;
  onChange: (html: string) => void;
};

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-sm transition ${
        active
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardUrl, setCardUrl] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // URL を読み込んでリンクカードを挿入（note 風: 入力→Enterで確定）。
  const insertCard = useCallback(async () => {
    const url = cardUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setCardError("有効なURL（http/https）を入力してください。");
      return;
    }
    setCardError(null);
    setCardLoading(true);
    try {
      const res = await fetch("/api/ogp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as {
        ogp?: {
          title: string;
          description: string;
          imageUrl: string;
          siteName: string;
        };
        error?: string;
      } | null;
      if (!res.ok || !data?.ogp) {
        setCardError(data?.error ?? "リンク情報を取得できませんでした。");
        return;
      }
      editor
        .chain()
        .focus()
        .insertLinkCard({
          href: url,
          title: data.ogp.title,
          description: data.ogp.description,
          image: data.ogp.imageUrl,
          siteName: data.ogp.siteName,
        })
        .run();
      setCardUrl("");
      setCardOpen(false);
    } catch {
      setCardError("リンク情報を取得できませんでした。");
    } finally {
      setCardLoading(false);
    }
  }, [cardUrl, editor]);

  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("リンクURL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const onPickImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      const body = new FormData();
      body.append("file", file);
      body.append("prefix", "posts");
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        window.alert(data?.error ?? "画像のアップロードに失敗しました");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      editor.chain().focus().setImage({ src: url }).run();
    },
    [editor]
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2 dark:border-gray-700">
      <ToolbarButton
        title="見出し1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        title="見出し2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        title="見出し3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        title="太字"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        title="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="箇条書き"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • リスト
      </ToolbarButton>
      <ToolbarButton
        title="番号付きリスト"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. リスト
      </ToolbarButton>
      <ToolbarButton
        title="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        引用
      </ToolbarButton>
      <ToolbarButton
        title="コードブロック"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {"</>"}
      </ToolbarButton>
      <ToolbarButton
        title="リンク"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        🔗
      </ToolbarButton>
      <ToolbarButton
        title="リンクカード"
        active={cardOpen}
        onClick={() => {
          setCardError(null);
          setCardOpen((v) => !v);
        }}
      >
        🔗＋
      </ToolbarButton>
      <ToolbarButton title="画像" onClick={() => fileRef.current?.click()}>
        🖼️
      </ToolbarButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onPickImage}
        className="hidden"
      />

      {cardOpen && (
        <div className="mt-1 flex w-full flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              type="url"
              autoFocus
              value={cardUrl}
              onChange={(e) => setCardUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!cardLoading) insertCard();
                } else if (e.key === "Escape") {
                  setCardOpen(false);
                }
              }}
              placeholder="https://… を貼り付けて Enter でカード挿入"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="button"
              onClick={insertCard}
              disabled={cardLoading || !cardUrl.trim()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              {cardLoading ? "取得中…" : "挿入"}
            </button>
          </div>
          {cardError && (
            <p className="text-xs text-red-600 dark:text-red-400">{cardError}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TiptapEditor({ initialHTML, onChange }: Props) {
  const editor = useEditor({
    immediatelyRender: false, // Next.js SSR でのハイドレーション不整合を防ぐ
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Image,
      LinkCard,
    ],
    content: initialHTML ?? "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[280px] px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return (
      <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700">
        エディタを読み込み中...
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
