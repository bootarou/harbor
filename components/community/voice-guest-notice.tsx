"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import type { VoiceParticipantView } from "@/lib/livekit";

/**
 * 未ログインの閲覧者に harborトーク の状況だけを見せる行。
 *
 * 参加・視聴はできないが「いま話している人がいる」「画面共有が始まっている」
 * ことが分からないと、アカウントを作る動機が生まれない。
 *
 * LiveKit のクライアント（livekit-client / @livekit/components-react）は
 * 読み込まない。参加できない相手に大きなバンドルを配らないため、
 * 表示はメッセージポーリングに相乗りしたサーバー側スナップショットだけで行う。
 */
export function VoiceGuestNotice({
  topicId,
  participants,
}: {
  topicId: string;
  participants: VoiceParticipantView[];
}) {
  const sharing = participants.some((p) => p.isSharing);
  const callbackUrl = `/community/${topicId}`;

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span aria-hidden="true">🎧</span>
          <span className="hidden sm:inline">harborトーク</span>
        </span>

        {participants.length === 0 ? (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            いま参加者はいません
          </span>
        ) : (
          <ul className="flex max-h-16 min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-y-auto">
            {participants.map((p) => (
              <li
                key={p.userId}
                className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-0.5 pr-2 text-xs dark:bg-gray-800"
                title={`${p.displayName ?? "（無名）"}${
                  p.isSpeaker ? "（発言できる）" : "（聴講中）"
                }`}
              >
                <UserAvatar
                  src={p.avatarUrl}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
                <span className="max-w-[10rem] truncate">
                  {p.displayName ?? "（無名）"}
                </span>
                <span aria-hidden="true">{p.isSpeaker ? "🎙" : "🎧"}</span>
              </li>
            ))}
          </ul>
        )}

        {sharing && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"
              aria-hidden="true"
            />
            🖥 画面共有中
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
        <p className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-400">
          {sharing
            ? "共有されている画面の視聴と、harborトークへの参加にはアカウントが必要です。"
            : "harborトークへの参加・画面共有の視聴・チャットへの投稿にはアカウントが必要です。"}
          <br className="hidden sm:inline" />
          作成は無料で、メールアドレスは要りません。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            アカウントを作成
          </Link>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium transition hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600"
          >
            ログイン
          </Link>
        </div>
      </div>
    </div>
  );
}
