"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addAnswer, type AnswerFormState } from "@/app/answers/actions";
import { TiptapEditor } from "@/components/editor/tiptap-editor";

const initialState: AnswerFormState = {};

// QA への回答投稿フォーム。本文は Tiptap で書き、hidden に HTML を載せて
// サーバーアクション(addAnswer)へ渡す（保存時にサニタイズされる）。
export function AnswerForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addAnswer, initialState);
  const [html, setHtml] = useState("");
  // 送信成功時にエディタを再マウントして内容をクリアするためのキー。
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (!state.success) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setHtml("");
    setEditorKey((k) => k + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
    router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="contentHTML" value={html} />
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      <TiptapEditor key={editorKey} initialHTML="" onChange={setHtml} />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        {pending ? "投稿中..." : "回答する"}
      </button>
    </form>
  );
}
