"use client";

import dynamic from "next/dynamic";
import type { VoiceParticipantView } from "@/lib/livekit";

// 音声スペースの読み込み口。チャット入力バーの「上の段」に置く1行。
// livekit-client / @livekit/components-react はブラウザ API 前提のため
// ssr:false で動的読み込みし、初期バンドルにも載せない
//（音声を使わない閲覧者に不要な JS を配らない）。
const VoiceDock = dynamic(
  () => import("./voice-panel").then((m) => m.VoiceDock),
  {
    ssr: false,
    // 読み込み中も行の高さを保ち、入力バーがガタつかないようにする。
    loading: () => (
      <div className="flex items-center gap-2 py-0.5">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span aria-hidden="true">🎧</span>
          <span className="hidden sm:inline">harborTalk</span>
        </span>
      </div>
    ),
  }
);

export function VoiceSpace({
  topicId,
  participants,
}: {
  topicId: string;
  participants: VoiceParticipantView[];
}) {
  return <VoiceDock topicId={topicId} participants={participants} />;
}
