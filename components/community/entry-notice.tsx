"use client";

import { useEffect, useState, useTransition } from "react";
import { notifyTopicEntry } from "@/app/community/actions";

/**
 * 部屋の作成者にだけ出す、入室通知の確認バー。
 *
 * 強制では流さず、入室のたびに「通知して入室」「通知せずに入室」を選ばせる。
 * 選んだあとは同じ部屋で一定時間出さない。読み込みのたびに聞かれると
 * 煩わしく、何度も通知を送ってしまう事故にもつながるため。
 *
 * 最終的な抑止はサーバー側のクールダウンで行う（localStorage は
 * 消せてしまうので、ここでの記憶は表示を控えるためだけのもの）。
 */

const ASK_KEY_PREFIX = "harbor.community.entryAsked:";
/** 一度選んだら、この時間は再び尋ねない。 */
const ASK_INTERVAL_MS = 60 * 60 * 1000;

function askedKey(topicId: string): string {
  return `${ASK_KEY_PREFIX}${topicId}`;
}

function shouldAsk(topicId: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(askedKey(topicId)));
    if (!Number.isFinite(at) || at <= 0) return true;
    return Date.now() - at > ASK_INTERVAL_MS;
  } catch {
    // localStorage が使えない環境では毎回尋ねる。
    return true;
  }
}

function remember(topicId: string): void {
  try {
    window.localStorage.setItem(askedKey(topicId), String(Date.now()));
  } catch {
    /* 記憶できなくても動作に影響はない */
  }
}

export function EntryNotice({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  useEffect(() => {
    // localStorage はクライアントでのみ参照できるため、マウント後に判定する。
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOpen(shouldAsk(topicId));
  }, [topicId]);

  function close(): void {
    remember(topicId);
    setOpen(false);
  }

  function notifyAndEnter(): void {
    setError(null);
    startSending(async () => {
      const res = await notifyTopicEntry(topicId);
      remember(topicId);
      if (res.ok) {
        setOpen(false);
        setDone("入室を通知しました");
        return;
      }
      setError(res.error ?? "通知に失敗しました");
    });
  }

  if (done) {
    return (
      <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">
        {done}
      </p>
    );
  }

  if (!open) return null;

  return (
    <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-medium">入室を通知しますか？</p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        この部屋で直近30日以内に発言した人へ、あなたが来たことをお知らせします。
        通知を受け取る側は、自分の通知設定でオフにできます。
      </p>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={notifyAndEnter}
          disabled={sending}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {sending ? "通知中..." : "通知して入室"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={sending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium transition hover:border-gray-400 disabled:opacity-50 dark:border-gray-700 dark:hover:border-gray-600"
        >
          通知せずに入室
        </button>
      </div>
    </div>
  );
}
