"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleBookmark } from "@/app/bookmarks/actions";

export function BookmarkButton({
  postId,
  isBookmarked,
}: {
  postId: string;
  isBookmarked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleBookmark(postId);
      if (res?.error) {
        setError(res.error);
      } else {
        setBookmarked(Boolean(res?.bookmarked));
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={bookmarked}
        title={bookmarked ? "ブックマーク解除" : "ブックマーク"}
        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          bookmarked
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300"
            : "border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill={bookmarked ? "currentColor" : "none"}>
          <path
            d="M6 4h12v16l-6-4-6 4V4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        {bookmarked ? "保存済み" : "ブックマーク"}
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </span>
  );
}
