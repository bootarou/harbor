"use client";

import { useActionState } from "react";
import { syncMyTips, type SyncTipsState } from "@/app/tips/actions";

const initialState: SyncTipsState = {};

export function SyncTipsButton() {
  const [state, formAction, pending] = useActionState(syncMyTips, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        {pending ? "同期中..." : "着金を同期"}
      </button>
      {state.message && (
        <span className="text-xs text-green-700 dark:text-green-300">
          {state.message}
        </span>
      )}
      {state.error && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
    </form>
  );
}
