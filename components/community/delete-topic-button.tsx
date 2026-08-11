"use client";

import { deleteTopic } from "@/app/community/actions";

// トピック削除ボタン。メッセージも全て削除されるため確認ダイアログを出す。
export function DeleteTopicButton({
  topicId,
  name,
}: {
  topicId: string;
  name: string;
}) {
  return (
    <form
      action={deleteTopic}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `トピック「${name}」を削除します。\nメッセージもすべて削除され、取り消せません。よろしいですか？`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="topicId" value={topicId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-2.5 py-1 text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        削除
      </button>
    </form>
  );
}
