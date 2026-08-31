"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addComment, type CommentFormState } from "@/app/comments/actions";
import { UserAvatar } from "@/components/user-avatar";

const initialState: CommentFormState = {};

export type MentionCandidate = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export function CommentForm({
  postId,
  candidates,
}: {
  postId: string;
  candidates: MentionCandidate[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addComment, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState("");
  // @ 補完のポップアップ状態。query は直近の @ からカーソルまでの文字列。
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // 実際にピッカーから選んだメンション先（表示名で本文に残っているものだけ送信）。
  const [picked, setPicked] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    if (!state.success) return;
    // サーバーアクション成功後にフォームを初期化する正当なケース。
    /* eslint-disable react-hooks/set-state-in-effect */
    formRef.current?.reset();
    setBody("");
    setPicked([]);
    setMenuOpen(false);
    router.refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state.success, router]);

  // 本文に「@表示名」が残っているメンションだけを userId 配列にして送信する
  // （削除された分は除外。サーバー側でも参加者かどうか再検証する）。
  const mentionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of picked) {
      if (body.includes(`@${p.displayName}`)) ids.add(p.id);
    }
    return [...ids];
  }, [picked, body]);

  // 候補の絞り込み（前方一致・大文字小文字無視・最大8件）。
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return candidates
      .filter((c) => c.displayName.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [candidates, query]);

  // カーソル直前の「@query」を検出する。@ の直前は行頭か空白のときのみ発火。
  function detectMention(value: string, caret: number) {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setMenuOpen(false);
      return;
    }
    const prev = at > 0 ? before[at - 1] : "";
    if (prev && !/\s/.test(prev)) {
      setMenuOpen(false);
      return;
    }
    const frag = before.slice(at + 1);
    // 改行を含む/長すぎる場合は補完対象外。
    if (/[\n\r]/.test(frag) || frag.length > 40) {
      setMenuOpen(false);
      return;
    }
    setQuery(frag);
    setActiveIndex(0);
    setMenuOpen(true);
  }

  function onChangeBody(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    detectMention(value, e.target.selectionStart ?? value.length);
  }

  // 候補を選択して「@表示名 」を挿入する。
  function choose(c: MentionCandidate) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) return;
    const inserted = `@${c.displayName} `;
    const next = before.slice(0, at) + inserted + body.slice(caret);
    setBody(next);
    setPicked((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
    setMenuOpen(false);
    // 挿入直後にカーソルを挿入分の後ろへ移す。
    const pos = at + inserted.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menuOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setMenuOpen(false);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="mentions" value={JSON.stringify(mentionIds)} />
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="relative">
        <textarea
          ref={taRef}
          name="body"
          rows={3}
          required
          maxLength={1000}
          value={body}
          onChange={onChangeBody}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // 候補クリックを拾えるよう少し遅らせて閉じる。
            setTimeout(() => setMenuOpen(false), 150);
          }}
          placeholder="コメントを書く（@ で参加者にメンション）"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        {menuOpen && filtered.length > 0 && (
          <ul className="absolute left-0 top-full z-30 mt-1 max-h-56 w-64 overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-950">
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  // onMouseDown なら textarea の blur より先に発火して選択できる。
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                    i === activeIndex
                      ? "bg-gray-100 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <UserAvatar
                    src={c.avatarUrl}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
/>
                  <span className="truncate">{c.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        {pending ? "投稿中..." : "コメントする"}
      </button>
    </form>
  );
}
