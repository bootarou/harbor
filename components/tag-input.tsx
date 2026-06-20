"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";

const MAX_TAGS = 10;
const MAX_LEN = 30;

// 親コンポーネントから命令的にタグを追加するためのハンドル。
export type TagInputHandle = { addTag: (raw: string) => void };

// チップ式のタグ入力。Enter（またはカンマ）で確定、× で削除。
// 値は hidden input(name) に JSON 配列で格納し、サーバーアクションへ渡す。
export const TagInput = forwardRef<
  TagInputHandle,
  {
    name: string;
    initialTags: string[];
    onChange?: () => void;
  }
>(function TagInput({ name, initialTags, onChange }, ref) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");

  // タグを1件追加（空・重複・上限超過は無視）。入力欄はクリアしない。
  // 関数型更新で最新stateを参照するため、命令的呼び出しでも安全。
  const insertTag = useCallback(
    (raw: string) => {
      const value = raw.trim().slice(0, MAX_LEN);
      if (!value) return;
      setTags((prev) =>
        prev.length >= MAX_TAGS || prev.includes(value)
          ? prev
          : [...prev, value]
      );
      onChange?.();
    },
    [onChange]
  );

  // 親から正規化ドメイン等を追加できるよう addTag を公開する。
  useImperativeHandle(ref, () => ({ addTag: insertTag }), [insertTag]);

  function addTag(raw: string) {
    insertTag(raw);
    setInput("");
  }

  function removeTag(target: string) {
    setTags(tags.filter((t) => t !== target));
    onChange?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      // フォーム送信を防ぎ、タグとして確定する。
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      // 入力が空のときの Backspace で直前のタグを削除。
      e.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>タグ（Enter で追加・最大{MAX_TAGS}個）</span>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`タグ ${tag} を削除`}
              className="leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => addTag(input)}
            maxLength={MAX_LEN}
            placeholder={tags.length === 0 ? "例: Symbol（Enterで追加）" : ""}
            className="flex-1 min-w-[8rem] bg-transparent py-1 outline-none"
          />
        )}
      </div>
      {/* サーバーへは JSON 配列で渡す */}
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
    </div>
  );
});
