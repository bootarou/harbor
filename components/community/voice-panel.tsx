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
import type { VoiceParticipantMetadata } from "@/lib/livekit";

// 音声スペース本体。livekit-client / @livekit/components-react を使うため
// voice-space.tsx から ssr:false で読み込まれる（サーバー側では評価しない）。

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

export function VoicePanel({
  topicId,
  canJoin,
}: {
  topicId: string;
  /** ログイン中か。未ログインなら参加ボタンの代わりに案内を出す。 */
  canJoin: boolean;
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
    let next: Room | null = null;
    try {
      const res = await fetch(`/api/community/${topicId}/voice-token`);
      const data = (await res.json().catch(() => null)) as
        | (Partial<TokenResponse> & { error?: string })
        | null;
      if (!res.ok || !data?.token || !data.wsUrl) {
        setError(data?.error ?? "音声スペースに接続できませんでした");
        return;
      }
      if (typeof data.maxSpeakers === "number") setMaxSpeakers(data.maxSpeakers);
      const created = new Room({ adaptiveStream: false, dynacast: false });
      next = created;
      // サーバー側から切断された（別タブでの参加・権限失効など）場合に状態を戻す。
      created.once(RoomEvent.Disconnected, () => {
        setRoom((cur) => (cur === created ? null : cur));
      });
      await created.connect(data.wsUrl, data.token);
      setRoom(created);
      next = null;
    } catch (e) {
      console.error("voice join error", e);
      setError(
        "音声スペースに接続できませんでした（サーバーの設定・ネットワークをご確認ください）"
      );
    } finally {
      // connect に失敗した Room は破棄する。
      if (next) void next.disconnect();
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

  return (
    <section className="mb-4 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          🎙 音声スペース
        </h2>
        {room ? (
          <button
            type="button"
            onClick={() => void leave()}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            退出
          </button>
        ) : canJoin ? (
          <button
            type="button"
            onClick={() => void join()}
            disabled={joining}
            className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {joining ? "接続中…" : "参加する"}
          </button>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ログインすると参加できます
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {room ? (
        <RoomContext.Provider value={room}>
          {/* 受信した音声を再生する（このコンポーネントが <audio> を管理する） */}
          <RoomAudioRenderer />
          <VoiceRoomBody topicId={topicId} maxSpeakers={maxSpeakers} />
        </RoomContext.Provider>
      ) : (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          参加すると、このトピックの音声スペースで話したり聴いたりできます。
        </p>
      )}
    </section>
  );
}

// 接続後の中身（参加者一覧・発言ボタン）。RoomContext 配下でのみ使う。
function VoiceRoomBody({
  topicId,
  maxSpeakers,
}: {
  topicId: string;
  maxSpeakers: number;
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

  // 発言権を得たらマイクON、返したらOFF（権限変更はサーバー→LiveKit 経由で届く）。
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
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>
          参加中: {participants.length}人 ・ スピーカー {speakers}/{maxSpeakers}
        </span>
        {connectionState !== ConnectionState.Connected && (
          <span className="text-amber-600 dark:text-amber-400">再接続中…</span>
        )}
        <button
          type="button"
          onClick={() => void toggleSpeaker()}
          disabled={pending || full}
          title={full ? "スピーカーが満員です" : undefined}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            canPublish
              ? "bg-red-600 text-white hover:bg-red-500"
              : "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
          }`}
        >
          {canPublish ? "🔇 聴講に戻る" : full ? "🎙 満員です" : "🎙 発言する"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <ul className="mt-2 flex flex-wrap items-center gap-1.5">
        {participants.map((p) => (
          <ParticipantChip
            key={p.identity || p.sid}
            participant={p}
            isSelf={p.identity === localParticipant.identity}
          />
        ))}
      </ul>
    </div>
  );
}

// 参加者ひとり分の表示。発言中はリング＋パルスで視覚的に示す。
function ParticipantChip({
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
    <li
      className={`flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs transition ${
        speaking
          ? "bg-green-100 ring-2 ring-green-500 dark:bg-green-900/40"
          : "bg-gray-100 dark:bg-gray-800"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.avatarUrl || "/avatar-placeholder.svg"}
        alt=""
        className={`h-4 w-4 rounded-full object-cover ${speaking ? "animate-pulse" : ""}`}
      />
      <span className="max-w-[9rem] truncate">
        {displayNameOf(participant)}
        {isSelf ? "（あなた）" : ""}
      </span>
      <span aria-hidden="true">{isSpeaker && micOn ? "🔊" : "🔇"}</span>
      <span className="sr-only">
        {isSpeaker && micOn ? "発言中" : "聴講中"}
      </span>
    </li>
  );
}
