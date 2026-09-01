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
import type { VoiceParticipantView } from "@/lib/livekit";
import { CommunityTipButton } from "@/components/community/community-tip-button";
import { TipTotal } from "@/components/community/tip-total";
import { VoiceSpace } from "@/components/community/voice-space";
import { ScreenDockContext } from "@/components/community/screen-dock";
import { UserAvatar } from "@/components/user-avatar";

const POLL_MS = 45_000;
// harborトークが行われている間は会話が動くため、チャットの取得間隔を短くする。
const POLL_MS_ACTIVE = 12_000;

// 画面共有ドックの幅（PC）。ドラッグで調整でき、端末ごとに記憶する。
// 既定は比率にしている。固定 px だと画面が小さいときに本文が潰れてしまうため。
// ドラッグ後は px で保存され、以降はそちらが使われる。
const DOCK_WIDTH_KEY = "harbor.community.dockWidth";
const DOCK_WIDTH_MIN = 320;

// 広げすぎて本文が潰れないよう、画面幅の7割で頭打ちにする。
function clampDockWidth(px: number): number {
  const max =
    typeof window === "undefined"
      ? 900
      : Math.max(DOCK_WIDTH_MIN, Math.round(window.innerWidth * 0.7));
  return Math.min(Math.max(px, DOCK_WIDTH_MIN), max);
}

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
  voiceEnabled,
  initialVoice,
}: {
  topicId: string;
  initialMessages: CommunityMessageView[];
  currentUserId: string | null;
  isTopicAuthor: boolean;
  placeableStamps: PlaceableStamp[];
  initialOnline: OnlineViewer[];
  /** LIVEKIT_* が設定された環境でのみ音声行を出す。 */
  voiceEnabled: boolean;
  /** 音声スペースの参加者（初期表示用。以後はポーリングで更新）。 */
  initialVoice: VoiceParticipantView[];
}) {
  const [messages, setMessages] = useState<CommunityMessageView[]>(initialMessages);
  const [online, setOnline] = useState<OnlineViewer[]>(initialOnline);
  const [voice, setVoice] = useState<VoiceParticipantView[]>(initialVoice);
  const [body, setBody] = useState("");
  const [stampOpen, setStampOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  // 添付画像（アップロード済みURL）と、その処理状態。
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 画面共有の描画先。VoicePanel からポータルで差し込まれる。
  // ref ではなくコールバック ref + state にして、要素が用意できた時点で
  // 子（VoicePanel）へ伝わるようにする。
  const [screenDock, setScreenDock] = useState<HTMLDivElement | null>(null);
  // ドック幅の調整。state ではなく CSS 変数を直接書き換える。
  // ドラッグ中に再描画するとメッセージ一覧ごと作り直されて重くなるため。
  const dockWrapRef = useRef<HTMLDivElement>(null);

  // 保存済みの幅を復元する。
  useEffect(() => {
    const el = dockWrapRef.current;
    if (!el) return;
    try {
      const saved = Number(window.localStorage.getItem(DOCK_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        el.style.setProperty("--dock-w", `${clampDockWidth(saved)}px`);
      }
    } catch {
      /* localStorage が使えない環境では既定幅のまま */
    }
  }, []);

  // 仕切りのドラッグ。ドックは右側にあるので、左へ動かすと広がる。
  function startDockResize(e: React.PointerEvent<HTMLElement>) {
    const el = dockWrapRef.current;
    if (!el) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = el.getBoundingClientRect().width;
    const onMove = (ev: PointerEvent) => {
      el.style.setProperty(
        "--dock-w",
        `${clampDockWidth(startW + (startX - ev.clientX))}px`
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        window.localStorage.setItem(
          DOCK_WIDTH_KEY,
          String(Math.round(el.getBoundingClientRect().width))
        );
      } catch {
        /* 保存できなくても表示は維持される */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  const imageInputRef = useRef<HTMLInputElement>(null);

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
  // poll の依存から messages を外すための参照。
  // 依存に入れると、メッセージ送信・投げ銭・削除のたびに poll が作り直され、
  // 下の useEffect が走ってタイマーが 0 から再起動する。
  // 会話が続いている間は再起動が繰り返され、取得が先送りされ続けていた。
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const current = messagesRef.current;
    const last = current[current.length - 1]?.createdAt;
    const qs = last ? `?after=${encodeURIComponent(last)}` : "";
    try {
      const res = await fetch(`/api/community/${topicId}/messages${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: CommunityMessageView[];
        online: OnlineViewer[];
        tips?: Record<string, { tipTotal: number; tipCount: number }>;
        voice?: VoiceParticipantView[];
      };
      appendMessages(data.messages);
      setOnline(data.online);
      // 音声スペースの参加者（未参加でも「いま誰がいるか」が見えるように）。
      if (data.voice) setVoice(data.voice);
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
  }, [topicId, appendMessages]);

  // harborトークが行われている間は会話が動くため、取得間隔を短くする。
  // 45秒のままだと、通話しながらのチャットが極端に遅れて見える。
  const pollMs = voice.length > 0 ? POLL_MS_ACTIVE : POLL_MS;

  useEffect(() => {
    const timer = window.setInterval(poll, pollMs);
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
  }, [poll, pollMs]);

  // 新着で最下部へスクロール。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const text = body.trim();
    const image = pendingImage;
    if (!text && !image) return; // 本文も画像も無ければ送らない
    setError(null);
    startSending(async () => {
      const res = await postMessage(topicId, text, undefined, image ?? undefined);
      if (res.ok) {
        appendMessages([res.message]);
        setBody("");
        setPendingImage(null);
      } else {
        setError(res.error);
      }
    });
  }

  // 画像を選択→アップロード（長辺500pxへ縮小・圧縮）→添付候補にする。
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/community/upload`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "画像のアップロードに失敗しました");
        return;
      }
      setPendingImage(data.url);
    } catch {
      setError("画像のアップロードに失敗しました");
    } finally {
      setImgUploading(false);
    }
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
    <ScreenDockContext.Provider value={screenDock}>
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
                <UserAvatar
                  src={v.avatarUrl}
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
      {/* PC は本文と画面共有を横並び、スマホは上下に積む。
          共有していないときはドックが empty:hidden で消え、本文が中央に残るため
          従来（max-w-3xl 中央寄せ）と同じ見た目になる。 */}
      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:justify-center">
      <ul className="flex w-full min-w-0 flex-1 flex-col gap-4 pb-4 lg:min-w-[22rem] lg:max-w-3xl">
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
              <UserAvatar
                src={m.user.avatarUrl}
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
                    {m.imageUrl && (
                      <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.imageUrl}
                          alt="添付画像"
                          className="max-h-64 max-w-[250px] rounded-lg border border-gray-200 object-contain dark:border-gray-800"
                        />
                      </a>
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

      {/* 画面共有のドック。中身（ポータル先の div）が空のときは
          has-[[data-dock]:empty]:hidden で仕切りごと消え、場所を取らない。
          ※ 判定は data-dock を付けたポータル先だけに限定すること。
             単に div:empty にすると、常に空の仕切り自身にも一致してしまい、
             ドックが永久に非表示になる。
          PC では本文の右に並び、スクロールしても見えるよう sticky にする。
          幅は CSS 変数 --dock-w で、仕切りのドラッグから書き換える。 */}
      <div
        ref={dockWrapRef}
        className="flex w-full gap-1 has-[[data-dock]:empty]:hidden lg:sticky lg:top-4 lg:w-[var(--dock-w,65%)] lg:shrink-0"
      >
        {/* 幅を調整する仕切り。PC のみ表示する（スマホは上下に積むため不要）。 */}
        <div
          onPointerDown={startDockResize}
          onDoubleClick={() => {
            // px 指定を消すと、CSS の既定（比率）に戻る。
            dockWrapRef.current?.style.removeProperty("--dock-w");
            try {
              window.localStorage.removeItem(DOCK_WIDTH_KEY);
            } catch {
              /* 消せなくても表示は既定に戻る */
            }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="画面共有の幅を調整（ダブルクリックで既定に戻す）"
          title="ドラッグで幅を調整（ダブルクリックで既定に戻す）"
          className="hidden w-1.5 shrink-0 cursor-col-resize rounded-full bg-gray-200 transition hover:bg-teal-400 lg:block dark:bg-gray-700 dark:hover:bg-teal-600"
        />
        <div ref={setScreenDock} data-dock className="min-w-0 flex-1" />
      </div>
      </div>

      {/* 入力欄（フロー内で下部に貼り付く sticky。フッターは常にこの下に来る） */}
      {currentUserId ? (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-gray-200 bg-white/95 backdrop-blur sm:-mx-6 dark:border-gray-800 dark:bg-gray-950/95">
          <div className="mx-auto w-full px-4 py-3 sm:px-6">
            {error && (
              <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            {/* 添付画像プレビュー */}
            {(pendingImage || imgUploading) && (
              <div className="mb-2 flex items-center gap-2">
                {imgUploading ? (
                  <span className="text-xs text-gray-500">画像を処理中…</span>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pendingImage as string}
                      alt="添付プレビュー"
                      className="h-16 w-16 rounded-md border border-gray-200 object-cover dark:border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => setPendingImage(null)}
                      className="text-xs text-gray-500 underline"
                    >
                      画像を外す
                    </button>
                  </>
                )}
              </div>
            )}
            {/* 音声＋入力を1つの角丸バーに2段で一体化 */}
            <div className="rounded-2xl border border-gray-300 bg-white transition focus-within:border-teal-500 dark:border-gray-700 dark:bg-gray-900">
              {/* 上段: 音声スペース（参加者を横スクロール表示） */}
              {voiceEnabled && (
                <div className="border-b border-gray-200 px-2.5 py-1.5 dark:border-gray-800">
                  <VoiceSpace topicId={topicId} participants={voice} />
                </div>
              )}
              {/* 下段: 添付・入力・送信 */}
              <div className="flex items-end gap-1 px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => setStampOpen((v) => !v)}
                title="スタンプを送る"
                aria-label="スタンプを送る"
                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${
                  stampOpen ? "bg-gray-100 dark:bg-gray-800" : ""
                }`}
              >
                🎨<span className="hidden sm:inline">スタンプ</span>
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={imgUploading}
                title="画像を添付"
                aria-label="画像を添付"
                className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                📷<span className="hidden sm:inline">画像</span>
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={onPickImage}
                className="hidden"
              />
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
                className="max-h-32 min-h-[2.25rem] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-0"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || (body.trim().length === 0 && !pendingImage)}
                title="送信"
                aria-label="送信"
                className="flex shrink-0 items-center justify-center rounded-full bg-black px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-40 sm:px-4 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              >
                {/* スマホ: 上矢印アイコンのみ。sm以上: 「送信」テキスト */}
                <span className="hidden sm:inline">{sending ? "…" : "送信"}</span>
                <svg
                  className="h-5 w-5 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 19V5M5 12l7-7 7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                </button>
              </div>
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
    </ScreenDockContext.Provider>
  );
}
