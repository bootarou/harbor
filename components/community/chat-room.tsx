"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  postMessage,
  deleteMessage,
  reportMessage,
} from "@/app/community/actions";
import type { CommunityMessageView } from "@/lib/community";
import type { PlaceableStamp } from "@/lib/stamps";

const POLL_MS = 45_000;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

export function ChatRoom({
  topicId,
  initialMessages,
  currentUserId,
  isTopicAuthor,
  placeableStamps,
}: {
  topicId: string;
  initialMessages: CommunityMessageView[];
  currentUserId: string | null;
  isTopicAuthor: boolean;
  placeableStamps: PlaceableStamp[];
}) {
  const [messages, setMessages] = useState<CommunityMessageView[]>(initialMessages);
  const [body, setBody] = useState("");
  const [stampOpen, setStampOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // 重複を避けつつ新着を末尾に追加する。
  const appendMessages = useCallback((incoming: CommunityMessageView[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  // 差分ポーリング（表示中・フォーカス時のみ）。最新 createdAt 以降を取得。
  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const last = messages[messages.length - 1]?.createdAt;
    if (!last) return;
    try {
      const res = await fetch(
        `/api/community/${topicId}/messages?after=${encodeURIComponent(last)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: CommunityMessageView[] };
      appendMessages(data.messages);
    } catch {
      /* ignore */
    }
  }, [messages, topicId, appendMessages]);

  useEffect(() => {
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [poll]);

  // 新着で最下部へスクロール。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startSending(async () => {
      const res = await postMessage(topicId, text);
      if (res.ok) {
        appendMessages([res.message]);
        setBody("");
      } else {
        setError(res.error);
      }
    });
  }

  // スタンプは選択した時点で即投稿（本文なし・送信ボタン不要）。
  function sendStamp(stamp: PlaceableStamp) {
    setError(null);
    setStampOpen(false);
    startSending(async () => {
      const res = await postMessage(topicId, "", stamp.id);
      if (res.ok) appendMessages([res.message]);
      else setError(res.error);
    });
  }

  function onDelete(id: string) {
    if (!window.confirm("このメッセージを削除しますか？")) return;
    startSending(async () => {
      const res = await deleteMessage(id);
      if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
      else setError(res.error ?? "削除に失敗しました");
    });
  }

  function onReport(id: string) {
    const reason = window.prompt("通報の理由（任意）を入力してください");
    if (reason === null) return; // キャンセル
    startSending(async () => {
      const res = await reportMessage(id, reason);
      // 通報されたメッセージは非表示化されるので一覧から除く。
      if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
      else setError(res.error ?? "通報に失敗しました");
    });
  }

  return (
    <div className="flex min-h-[65vh] flex-col">
      {/* メッセージ一覧（下が最新）。flex-1 で伸ばし、入力欄を下部へ押し出す。 */}
      <ul className="flex flex-1 flex-col gap-4 pb-4">
        {messages.length === 0 && (
          <li className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            まだメッセージがありません。最初の一言をどうぞ。
          </li>
        )}
        {messages.map((m) => {
          const canDelete =
            currentUserId != null &&
            (m.userId === currentUserId || isTopicAuthor);
          return (
            <li key={m.id} className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.user.avatarUrl || "/avatar-placeholder.svg"}
                alt=""
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/users/${m.user.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {m.user.displayName ?? "（無名）"}
                  </Link>
                  <span className="text-xs text-gray-400">{formatTime(m.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(m.id)}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        削除
                      </button>
                    )}
                    {currentUserId != null && m.userId !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => onReport(m.id)}
                        className="text-xs text-gray-400 hover:underline"
                      >
                        通報
                      </button>
                    )}
                  </span>
                </div>
                {m.body && (
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                )}
                {m.stamp && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.stamp.imageUrl}
                    alt={m.stamp.name}
                    style={{ width: 96, height: 96 }}
                    className="mt-1 object-contain"
                  />
                )}
              </div>
            </li>
          );
        })}
        <div ref={bottomRef} />
      </ul>

      {/* 入力欄（フロー内で下部に貼り付く sticky。フッターは常にこの下に来る） */}
      {currentUserId ? (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-gray-200 bg-white/95 backdrop-blur sm:-mx-6 dark:border-gray-800 dark:bg-gray-950/95">
          <div className="w-full px-4 py-3 sm:px-6">
            {error && (
              <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setStampOpen((v) => !v)}
                title="スタンプを送る"
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                🎨
              </button>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!sending) send();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="メッセージを入力（⌘/Ctrl+Enterで送信）"
                className="max-h-32 flex-1 resize-y rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || body.trim().length === 0}
                className="shrink-0 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {sending ? "送信中..." : "送信"}
              </button>
            </div>

            {/* スタンプ選択ポップアップ（購入済みのみ） */}
            {stampOpen && (
              <div className="mt-2 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                {placeableStamps.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                    送れるスタンプがありません。
                    <Link href="/stamps" className="ml-1 underline">
                      スタンプを購入する →
                    </Link>
                  </p>
                ) : (
                  <div className="grid max-h-40 grid-cols-6 gap-1 overflow-auto">
                    {placeableStamps.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={sending}
                        onClick={() => sendStamp(s)}
                        title={`${s.name} を送る`}
                        className="rounded p-1 transition hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-900"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.imageUrl}
                          alt={s.name}
                          style={{ width: 48, height: 48 }}
                          className="mx-auto object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-gray-200 bg-white/95 py-3 text-center text-sm backdrop-blur sm:-mx-6 dark:border-gray-800 dark:bg-gray-950/95">
          投稿するには{" "}
          <Link href={`/login?callbackUrl=/community/${topicId}`} className="underline">
            ログイン
          </Link>
          してください。
        </div>
      )}
    </div>
  );
}
