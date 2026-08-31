"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ParticipantEvent,
  Room,
  RoomEvent,
} from "livekit-client";
import type { LocalParticipant, Participant } from "livekit-client";
import {
  RoomAudioRenderer,
  RoomContext,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import type {
  VoiceParticipantMetadata,
  VoiceParticipantView,
} from "@/lib/livekit";

// 音声スペースの行。チャット入力バーの「上の段」に常時表示し、
// 未参加でも「いま誰が音声にいるか」が見えるようにする（横スクロール）。
// livekit-client / @livekit/components-react を使うため voice-space.tsx から
// ssr:false で読み込まれる（サーバー側では評価しない）。
//
// 参加者の取得元は状態で切り替える:
//   未参加 … messages ポーリングに相乗りしたサーバー側スナップショット（props）
//   参加中 … LiveKit から届くリアルタイム情報（useParticipants）
//
// アイコンは状態で切り替える。既定は「聴講者」なので入口は 🎧（聴く）にし、
// 🎙（マイク）は実際に発言権を得たときだけ出す。入口をマイクにすると
// 「話さないといけない」と誤解されて参加自体を敬遠されるため。

type TokenResponse = {
  token: string;
  wsUrl: string;
  maxSpeakers: number;
  speakers: number;
};

// 参加者 metadata（サーバーがトークンに埋めた公開情報）を安全に読む。
function readMetadata(p: Participant): Partial<VoiceParticipantMetadata> {
  if (!p.metadata) return {};
  try {
    const parsed: unknown = JSON.parse(p.metadata);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<VoiceParticipantMetadata>;
  } catch {
    return {};
  }
}

function displayNameOf(p: Participant): string {
  return p.name?.trim() || readMetadata(p).displayName?.trim() || "（無名）";
}

/**
 * 発言権の付与が LiveKit からクライアントへ届くのを待つ。
 * サーバーの権限更新は非同期に伝播するため、届く前に publish すると
 * livekit-client 側で弾かれる。届かなければ false（タイムアウト）。
 */
function waitForPublishPermission(
  participant: LocalParticipant,
  timeoutMs = 5_000
): Promise<boolean> {
  if (participant.permissions?.canPublish) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (granted: boolean) => {
      window.clearTimeout(timer);
      participant.off(ParticipantEvent.ParticipantPermissionsChanged, onChange);
      resolve(granted);
    };
    const onChange = () => {
      if (participant.permissions?.canPublish) finish(true);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    participant.on(ParticipantEvent.ParticipantPermissionsChanged, onChange);
  });
}

// 開発時に WebRTC の実際の経路を確認するための診断ログ。
// シグナリングは Cloudflare Tunnel 経由、メディアはグローバルIPへ直接 UDP、
// という想定どおりに繋がっているかを確かめるために使う（本番では出さない）。
// 参加者のトラックから RTCStatsReport を読み、選択された candidate pair を表示する。
type IceCandidateStat = {
  candidateType?: string;
  address?: string;
  port?: number;
  protocol?: string;
};

async function logIceDiagnostics(room: Room): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  try {
    // 自分の publish 中トラック、無ければ購読中のリモートトラックを使う。
    const local = [...room.localParticipant.trackPublications.values()].find(
      (p) => p.track
    )?.track;
    const remote = [...room.remoteParticipants.values()]
      .flatMap((p) => [...p.trackPublications.values()])
      .find((p) => p.track)?.track;
    const track = local ?? remote;
    if (!track) return;

    const report = await track.getRTCStatsReport();
    if (!report) return;

    const pairs: RTCIceCandidatePairStats[] = [];
    const candidates = new Map<string, IceCandidateStat>();
    report.forEach((stat) => {
      if (stat.type === "candidate-pair") pairs.push(stat as RTCIceCandidatePairStats);
      if (stat.type === "local-candidate" || stat.type === "remote-candidate") {
        candidates.set(stat.id, stat as IceCandidateStat);
      }
    });
    const selected =
      pairs.find((p) => p.state === "succeeded" && p.nominated) ??
      pairs.find((p) => p.state === "succeeded");
    if (!selected) return;

    const localCand = selected.localCandidateId
      ? candidates.get(selected.localCandidateId)
      : undefined;
    const remoteCand = selected.remoteCandidateId
      ? candidates.get(selected.remoteCandidateId)
      : undefined;

    console.info("[livetalk] ICE 診断", {
      connectionState: room.state,
      iceState: selected.state,
      protocol: remoteCand?.protocol ?? localCand?.protocol,
      localCandidate: localCand
        ? `${localCand.candidateType} ${localCand.address ?? "?"}:${localCand.port ?? "?"}`
        : "(不明)",
      remoteCandidate: remoteCand
        ? `${remoteCand.candidateType} ${remoteCand.address ?? "?"}:${remoteCand.port ?? "?"}`
        : "(不明)",
      note: "remoteCandidate がサーバーのグローバルIP・protocol が udp なら想定どおり",
    });
  } catch (e) {
    console.debug("[livetalk] ICE 診断を取得できませんでした", e);
  }
}

// 行の右端に置く操作ボタンの基本クラス。
const ROW_BUTTON =
  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

// 行の左端ラベル（アイコン＋「音声」）。
function RowLabel({ icon }: { icon: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <span aria-hidden="true">{icon}</span>
      <span className="hidden sm:inline">ライブトーク</span>
    </span>
  );
}

// 参加者チップ（横スクロールの1件）。live=LiveKit接続中のリアルタイム表示。
function Chip({
  displayName,
  avatarUrl,
  isSpeaker,
  isSelf,
  speaking,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  isSpeaker: boolean;
  isSelf: boolean;
  speaking?: boolean;
}) {
  return (
    <li
      className={`flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs transition ${
        speaking
          ? "bg-green-100 ring-2 ring-green-500 dark:bg-green-900/40"
          : "bg-gray-100 dark:bg-gray-800"
      }`}
      title={`${displayName ?? "（無名）"}${isSpeaker ? "（発言できる）" : "（聴講中）"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl || "/avatar-placeholder.svg"}
        alt=""
        className={`h-4 w-4 rounded-full object-cover ${speaking ? "animate-pulse" : ""}`}
      />
      <span className="max-w-[6rem] truncate">
        {displayName ?? "（無名）"}
        {isSelf ? "（あなた）" : ""}
      </span>
      <span aria-hidden="true">{isSpeaker ? "🎙" : "🎧"}</span>
    </li>
  );
}

// 参加者が0人のときの案内。
function EmptyHint() {
  return (
    <span className="text-xs text-gray-400 dark:text-gray-500">
      まだ誰もいません
    </span>
  );
}

export function VoiceDock({
  topicId,
  participants: snapshot,
}: {
  topicId: string;
  /** 未参加時に表示する参加者（messages ポーリング由来のスナップショット）。 */
  participants: VoiceParticipantView[];
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [maxSpeakers, setMaxSpeakers] = useState(5);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  // アンマウント時・ページ離脱時に必ず切断する（ゴースト参加者を残さない）。
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
    };
  }, []);

  const join = useCallback(async () => {
    if (joining || room) return;
    setError(null);
    setJoining(true);
    let pending: Room | null = null;
    try {
      const res = await fetch(`/api/community/${topicId}/voice-token`);
      const data = (await res.json().catch(() => null)) as
        | (Partial<TokenResponse> & { error?: string })
        | null;
      if (!res.ok || !data?.token || !data.wsUrl) {
        setError(data?.error ?? "ライブトークに接続できませんでした");
        return;
      }
      if (typeof data.maxSpeakers === "number") setMaxSpeakers(data.maxSpeakers);
      const created = new Room({ adaptiveStream: false, dynacast: false });
      pending = created;
      // サーバー側から切断された（別タブでの参加・権限失効など）場合に状態を戻す。
      created.once(RoomEvent.Disconnected, () => {
        setRoom((cur) => (cur === created ? null : cur));
      });
      await created.connect(data.wsUrl, data.token);
      setRoom(created);
      pending = null;
      // 開発時のみ、実際に選ばれた ICE 経路をコンソールへ出す。
      if (process.env.NODE_ENV !== "production") {
        window.setTimeout(() => void logIceDiagnostics(created), 3000);
      }
    } catch (e) {
      console.error("voice join error", e);
      setError(
        "ライブトークに接続できませんでした（サーバーの設定・ネットワークをご確認ください）"
      );
    } finally {
      // connect に失敗した Room は破棄する。
      if (pending) void pending.disconnect();
      setJoining(false);
    }
  }, [joining, room, topicId]);

  const leave = useCallback(async () => {
    const cur = room;
    setRoom(null);
    if (!cur) return;
    try {
      // 発言中なら権限を返してから抜ける（席を空ける）。
      if (cur.localParticipant.permissions?.canPublish) {
        await fetch(`/api/community/${topicId}/voice-speaker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speak: false }),
        }).catch(() => undefined);
      }
      await cur.disconnect();
    } catch {
      /* ignore */
    }
  }, [room, topicId]);

  if (room) {
    return (
      <RoomContext.Provider value={room}>
        {/* 受信した音声を再生する（このコンポーネントが <audio> を管理する） */}
        <RoomAudioRenderer />
        <VoiceRowConnected
          topicId={topicId}
          maxSpeakers={maxSpeakers}
          onLeave={leave}
        />
      </RoomContext.Provider>
    );
  }

  // 未参加。サーバー側スナップショットで「いま誰がいるか」を見せる。
  return (
    <div className="flex items-center gap-2">
      <RowLabel icon="🎧" />
      <ul className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {snapshot.length === 0 ? (
          <EmptyHint />
        ) : (
          snapshot.map((p) => (
            <Chip
              key={p.userId}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              isSpeaker={p.isSpeaker}
              isSelf={false}
            />
          ))
        )}
      </ul>
      {error && (
        <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void join()}
        disabled={joining}
        title="ライブトークに参加（聴くだけでもOK）"
        aria-label="ライブトークに参加。聴くだけでも参加できます"
        className={`${ROW_BUTTON} bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200`}
      >
        {joining ? "接続中…" : "参加"}
      </button>
    </div>
  );
}

// 接続後の行。参加者はリアルタイム表示になり、発言・退出の操作が出る。
function VoiceRowConnected({
  topicId,
  maxSpeakers,
  onLeave,
}: {
  topicId: string;
  maxSpeakers: number;
  onLeave: () => void | Promise<void>;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPublish = localParticipant.permissions?.canPublish === true;
  const speakers = participants.filter(
    (p) => p.permissions?.canPublish === true
  ).length;
  const full = !canPublish && speakers >= maxSpeakers;

  // 発言権を失ったらマイクを確実に落とす（権限変更はサーバー→LiveKit 経由で届く）。
  useEffect(() => {
    if (canPublish) return;
    if (localParticipant.isMicrophoneEnabled) {
      void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    }
  }, [canPublish, localParticipant]);

  async function toggleSpeaker() {
    if (pending) return;
    setError(null);
    setPending(true);
    const speak = !canPublish;
    try {
      const res = await fetch(`/api/community/${topicId}/voice-speaker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speak }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "発言権の変更に失敗しました");
        return;
      }
      if (speak) {
        // 権限の反映を待ってから publish する（届く前に出すと弾かれる）。
        const granted = await waitForPublishPermission(localParticipant);
        if (!granted) {
          setError("発言権の反映に時間がかかっています。もう一度お試しください。");
          return;
        }
        await localParticipant.setMicrophoneEnabled(true);
      } else {
        await localParticipant.setMicrophoneEnabled(false);
      }
    } catch (e) {
      console.error("voice speaker error", e);
      setError(
        speak
          ? "マイクを使用できませんでした（ブラウザの許可をご確認ください）"
          : "発言権の変更に失敗しました"
      );
      // マイクが使えない場合は権限を返しておく。
      if (speak) {
        await fetch(`/api/community/${topicId}/voice-speaker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speak: false }),
        }).catch(() => undefined);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <RowLabel icon={canPublish ? "🎙" : "🎧"} />
      <ul className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {participants.map((p) => (
          <LiveChip
            key={p.identity || p.sid}
            participant={p}
            isSelf={p.identity === localParticipant.identity}
          />
        ))}
      </ul>

      {connectionState !== ConnectionState.Connected && (
        <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
          再接続中…
        </span>
      )}
      {error && (
        <span
          className="max-w-[14rem] shrink-0 truncate text-xs text-red-600 dark:text-red-400"
          title={error}
        >
          {error}
        </span>
      )}

      <button
        type="button"
        onClick={() => void toggleSpeaker()}
        disabled={pending || full}
        title={
          full
            ? "発言できる人数が上限に達しています"
            : canPublish
              ? "マイクを切って聴講に戻る"
              : `発言する（${speakers}/${maxSpeakers}人）`
        }
        className={`${ROW_BUTTON} ${
          canPublish
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        }`}
      >
        {canPublish
          ? "🎧 聴講に戻る"
          : full
            ? "満員"
            : `🎙 発言 ${speakers}/${maxSpeakers}`}
      </button>
      <button
        type="button"
        onClick={() => void onLeave()}
        className={`${ROW_BUTTON} border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800`}
      >
        退出
      </button>
    </div>
  );
}

// 接続中のリアルタイム参加者チップ（発言中の光り方を出せる）。
function LiveChip({
  participant,
  isSelf,
}: {
  participant: Participant;
  isSelf: boolean;
}) {
  const speaking = useIsSpeaking(participant);
  const isSpeaker = participant.permissions?.canPublish === true;
  const micOn = participant.isMicrophoneEnabled;
  const meta = readMetadata(participant);

  return (
    <Chip
      displayName={displayNameOf(participant)}
      avatarUrl={meta.avatarUrl ?? null}
      isSpeaker={isSpeaker && micOn}
      isSelf={isSelf}
      speaking={speaking}
    />
  );
}
