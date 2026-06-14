"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold">エラーが発生しました</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        時間をおいて再度お試しください。問題が続く場合は管理者にお問い合わせください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        再試行
      </button>
    </main>
  );
}
