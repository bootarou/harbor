"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  postMessage,
  deleteMessage,
  reportMessage,
} from "@/app/community/actions";
import type { CommunityMessageView } from "@/lib/community";
import type { OnlineViewer } from "@/lib/community/presence";
import type { PlaceableStamp } from "@/lib/stamps";
import { CommunityTipButton } from "@/components/community/community-tip-button";
import { TipTotal } from "@/components/community/tip-total";

const POLL_MS = 45_000;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

// 本文中の http(s) URL をクリック可能なリンクに変換する（本文はサニタイズ済みプレーンテキスト）。
// dangerouslySetInnerHTML は使わず、テキストと <a> の React ノード配列を組み立てて安全に描画する。
function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(https?:\/\/[^\s]+)/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const raw = match[0];
    // 末尾の句読点・閉じ括弧は URL に含めない（テキストとして分離）。
    const url = raw.replace(/[)\]}>,.!?。、）」』】]+$/u, "");
    const trailing = raw.slice(url.length);
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-2 break-all"
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    last = match.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function ChatRoom({
  topicId,
  initialMessages,
  currentUserId,
  isTopicAuthor,
  placeableStamps,
  initialOnline,
}: {
  topicId: string;
  initialMessages: CommunityMessageView[];
  currentUserId: string | null;
  isTopicAuthor: boolean;
  placeableStamps: PlaceableStamp[];
  initialOnline: OnlineViewer[];
}) {
  const [messages, setMessages] = useState<CommunityMessageView[]>(initialMessages);
  const [online, setOnline] = useState<OnlineViewer[]>(initialOnline);
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

  // 差分ポーリング（表示中・フォーカス時のみ）。新着メッセージ取得＋オンライン更新を兼ねる。
  // メッセージが無いトピックでもプレゼンス（在室）を更新するため、after 無しでも必ず叩く。
  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const last = messages[messages.length - 1]?.createdAt;
    const qs = last ? `?after=${encodeURIComponent(last)}` : "";
    try {
      const res = await fetch(`/api/community/${topicId}/messages${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: CommunityMessageView[];
        online: OnlineViewer[];
        tips?: Record<string, { tipTotal: number; tipCount: number }>;
      };
      appendMessages(data.messages);
      setOnline(data.online);
      // 既存メッセージへの投げ銭増加をスナップショットで反映。
      if (data.tips) {
        const tips = data.tips;
        setMessages((prev) =>
          prev.map((m) => {
            const t = tips[m.id];
            return t && (t.tipTotal !== m.tipTotal || t.tipCount !== m.tipCount)
              ? { ...m, tipTotal: t.tipTotal, tipCount: t.tipCount }
              : m;
          })
        );
      }
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

  // 投げ銭成功時に該当メッセージの合計を更新（カウントアップ・アニメで反映）。
  function onTipped(messageId: string, tipTotal: number, tipCount: number) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, tipTotal, tipCount } : m))
    );
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
      {/* オンライン（いま閲覧中）のメンバー。ログイン中の閲覧者を直近90秒で判定。 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs dark:border-gray-800">
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-green-600 dark:text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
          オンライン {online.length}人
        </span>
        {online.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {online.slice(0, 10).map((v) => (
              <span
                key={v.id}
                className="flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-0.5 pr-2 dark:bg-gray-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.avatarUrl || "/avatar-placeholder.svg"}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
                <span className="max-w-[9rem] truncate">
                  {v.displayName ?? "（無名）"}
                  {v.id === currentUserId ? "（あなた）" : ""}
                </span>
              </span>
            ))}
            {online.length > 10 && (
              <span className="text-gray-400">+{online.length - 10}</span>
            )}
          </div>
        ) : (
          <span className="text-gray-400">いま閲覧している人はいません</span>
        )}
      </div>

      {/* メッセージ一覧（下が最新）。flex-1 で伸ばし、入力欄を下部へ押し出す。 */}
      <ul className="flex flex-1 flex-col gap-4 pb-4">
        {messages.length === 0 && (
          <li className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            まだメッセージがありません。最初の一言をどうぞ。
          </li>
        )}
        {messages.map((m) => {
          const mine = currentUserId != null && m.userId === currentUserId;
          const canDelete = currentUserId != null && (mine || isTopicAuthor);
          return (
            <li
              key={m.id}
              className={`flex gap-2 sm:gap-3 ${mine ? "flex-row-reverse" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.user.avatarUrl || "/avatar-placeholder.svg"}
                alt=""
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <div
                className={`flex min-w-0 max-w-[80%] flex-col ${
                  mine ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* 自分のメッセージは名前を省略（自分だと分かるため） */}
                  {!mine && (
                    <Link
                      href={`/users/${m.user.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {m.user.displayName ?? "（無名）"}
                    </Link>
                  )}
                  <span className="text-xs text-gray-400">{formatTime(m.createdAt)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(m.id)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      削除
                    </button>
                  )}
                  {currentUserId != null && !mine && (
                    <button
                      type="button"
                      onClick={() => onReport(m.id)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      通報
                    </button>
                  )}
                </div>
                {/* 本文/スタンプと投げ銭バッジを同じ行に横並び（上端揃え・自分は左右反転） */}
                <div
                  className={`mt-0.5 flex items-start gap-2 ${
                    mine ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`flex min-w-0 flex-col gap-1 ${
                      mine ? "items-end" : "items-start"
                    }`}
                  >
                    {m.body && (
                      <p
                        className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                          mine
                            ? "bg-teal-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        {linkify(m.body)}
                      </p>
                    )}
                    {m.stamp && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.stamp.imageUrl}
                        alt={m.stamp.name}
                        style={{ width: 96, height: 96 }}
                        className="object-contain"
                      />
                    )}
                  </div>
                  <TipTotal total={m.tipTotal} count={m.tipCount} />
                  {currentUserId != null && !mine && (
                    <CommunityTipButton
                      messageId={m.id}
                      recipientAddress={m.authorAddress}
                      authorName={m.user.displayName ?? "この人"}
                      onTipped={(total, count) => onTipped(m.id, total, count)}
                    />
                  )}
                </div>
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
                className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                🎨 <span>スタンプ</span>
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
