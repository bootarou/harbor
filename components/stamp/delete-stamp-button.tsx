"use client";

import { deleteStamp } from "@/app/stamps/actions";

// スタンプ削除ボタン。誤操作防止のため確認ダイアログを出す。
// （購入実績があるスタンプはサーバー側で削除を拒否する。）
export function DeleteStampButton({
  stampId,
  name,
  disabled,
}: {
  stampId: string;
  name: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        title="購入者がいるスタンプは削除できません（非公開にできます）"
        className="rounded-md border border-gray-200 px-3 py-1.5 text-gray-400 dark:border-gray-800"
      >
        削除不可
      </span>
    );
  }
  return (
    <form
      action={deleteStamp}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `スタンプ「${name}」を削除します。\nこの操作は取り消せません。よろしいですか？`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="stampId" value={stampId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        削除
      </button>
    </form>
  );
}
