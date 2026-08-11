"use client";

import { deletePost } from "@/app/posts/actions";

// 記事削除ボタン。誤操作防止のため送信前に確認ダイアログを出す。
// 確認でキャンセルされたら preventDefault でサーバーアクションを実行しない。
export function DeletePostButton({
  postId,
  title,
}: {
  postId: string;
  title: string;
}) {
  return (
    <form
      action={deletePost}
      onSubmit={(e) => {
        const ok = window.confirm(
          `「${title}」を削除します。\nこの操作は取り消せません。よろしいですか？`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        削除
      </button>
    </form>
  );
}
