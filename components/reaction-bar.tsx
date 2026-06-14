"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REACTION_TYPES } from "@/lib/thanks";
import { toggleReaction } from "@/app/reactions/actions";

export function ReactionBar({
  postId,
  counts,
  mine,
  isLoggedIn,
}: {
  postId: string;
  counts: Record<string, number>;
  mine: string[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function react(key: string) {
    if (!isLoggedIn) return;
    setBusyKey(key);
    startTransition(async () => {
      await toggleReaction(postId, key);
      router.refresh();
      setBusyKey(null);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="mb-3 text-sm font-semibold">この記事はどうでしたか？</p>
      <div className="flex flex-wrap gap-2">
        {REACTION_TYPES.map((r) => {
          const active = mine.includes(r.key);
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => react(r.key)}
              disabled={!isLoggedIn || (pending && busyKey === r.key)}
              title={r.label}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
                active
                  ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                  : "border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
              } ${!isLoggedIn ? "cursor-default" : ""}`}
            >
              <span>{r.emoji}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {counts[r.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      {!isLoggedIn && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          リアクションするには{" "}
          <Link href={`/login?callbackUrl=/posts/${postId}`} className="underline">
            ログイン
          </Link>
          してください。
        </p>
      )}
    </div>
  );
}
