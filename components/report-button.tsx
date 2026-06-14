"use client";

import { useState } from "react";

// 控えめな記事通報ボタン（薄い文字色）。理由を任意入力して送信。
export function ReportButton({
  postId,
  isLoggedIn,
}: {
  postId: string;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, reason }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "送信に失敗しました");
        return;
      }
      setDone(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-3 text-xs text-gray-400 dark:text-gray-600">
        通報を受け付けました。ご協力ありがとうございます。
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!isLoggedIn) {
            setError("通報するにはログインしてください。");
            return;
          }
          setOpen(true);
        }}
        className="mt-3 text-xs text-gray-400 underline transition hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400"
      >
        この記事を通報する
        {error && <span className="ml-2 text-red-400">{error}</span>}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="通報の理由（任意）"
        className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          {busy ? "送信中..." : "通報を送信"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 underline"
        >
          やめる
        </button>
      </div>
    </div>
  );
}
