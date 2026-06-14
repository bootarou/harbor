"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followUser, unfollowUser } from "@/app/users/actions";

export function FollowButton({
  targetId,
  isFollowing,
}: {
  targetId: string;
  isFollowing: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("targetId", targetId);
      const res = await (isFollowing ? unfollowUser : followUser)({}, fd);
      if (res?.error) {
        setError(res.error);
      } else {
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
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
          isFollowing
            ? "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
            : "bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        }`}
      >
        {pending ? "..." : isFollowing ? "フォロー中" : "フォローする"}
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </span>
  );
}
