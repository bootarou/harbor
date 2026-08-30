"use client";

import dynamic from "next/dynamic";

// 音声スペースの読み込み口。
// livekit-client / @livekit/components-react はブラウザ API 前提のため
// ssr:false で動的読み込みし、初期バンドルにも載せない
//（音声を使わない閲覧者に不要な JS を配らない）。
const VoicePanel = dynamic(
  () => import("./voice-panel").then((m) => m.VoicePanel),
  {
    ssr: false,
    loading: () => (
      <div className="mb-4 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        🎙 音声スペースを準備中…
      </div>
    ),
  }
);

export function VoiceSpace({
  topicId,
  canJoin,
}: {
  topicId: string;
  canJoin: boolean;
}) {
  return <VoicePanel topicId={topicId} canJoin={canJoin} />;
}
