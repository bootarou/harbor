"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { LocalParticipant, Participant } from "livekit-client";
// canPublishSources はプロトコル定義の enum。livekit-client は再エクスポート
// していないため、依存に含まれる @livekit/protocol から直接取り込む。
import { TrackSource } from "@livekit/protocol";
import {
  RoomAudioRenderer,
  RoomContext,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import type {
  VoiceParticipantMetadata,
  VoiceParticipantView,
} from "@/lib/livekit";
import { ScreenShareModal } from "@/components/community/screen-share-modal";
import { UserAvatar } from "@/components/user-avatar";

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

    console.info("[harborTalk] ICE 診断", {
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
    console.debug("[harborTalk] ICE 診断を取得できませんでした", e);
  }
}

/**
 * 画面共有の publish 権限がサーバー→LiveKit 経由で届くのを待つ。
 * マイクと同じく、権限が届く前に publish すると弾かれる。
 */
function waitForScreenSharePermission(
  participant: LocalParticipant,
  timeoutMs = 5_000
): Promise<boolean> {
  const allowed = () =>
    participant.permissions?.canPublishSources?.includes(
      TrackSource.SCREEN_SHARE
    ) ?? false;
  if (allowed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (granted: boolean) => {
      window.clearTimeout(timer);
      participant.off(ParticipantEvent.ParticipantPermissionsChanged, onChange);
      resolve(granted);
    };
    const onChange = () => {
      if (allowed()) finish(true);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    participant.on(ParticipantEvent.ParticipantPermissionsChanged, onChange);
  });
}

// 画面共有の取り込み設定。動画配信ではなく資料・コードを見せる用途なので、
// フレームレートを抑えて解像度（＝文字の可読性）に帯域を回す。
const SCREEN_CAPTURE = {
  resolution: { width: 1280, height: 720, frameRate: 10 },
  audio: false,
} as const;
// publish 側でも上限を揃える。動きが少ない画面なので低ビットレートで足りる。
const SCREEN_PUBLISH = {
  screenShareEncoding: { maxBitrate: 1_200_000, maxFramerate: 10 },
} as const;

// 行の右端に置く操作ボタンの基本クラス。
const ROW_BUTTON =
  "shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

// 行の左端ラベル（アイコン＋「音声」）。
function RowLabel({ icon }: { icon: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 py-1 text-xs text-gray-500 dark:text-gray-400">
      <span aria-hidden="true">{icon}</span>
      <span className="hidden sm:inline">harborトーク</span>
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
      <UserAvatar
        src={avatarUrl}
        alt=""
        className={`h-4 w-4 rounded-full object-cover ${speaking ? "animate-pulse" : ""}`}
/>
      <span className="max-w-[9rem] truncate">
        {displayName ?? "（無名）"}
        {isSelf ? "（あなた）" : ""}
      </span>
      <span aria-hidden="true">{isSpeaker ? "🎙" : "🎧"}</span>
    </li>
  );
}

// 参加者リスト。人数が少ないうちは1行、増えたら折りたたむ。
// 入力バーの上段に置いているため、際限なく縦に伸びるとチャットを圧迫する。
// 既定は先頭数人＋「+N」で1行に収め、▾ で全員を折り返し表示に展開する。
const COLLAPSED_LIMIT = 3;

function ParticipantList({ children }: { children: React.ReactNode[] }) {
  const [expanded, setExpanded] = useState(false);
  const total = children.length;
  const overflow = total - COLLAPSED_LIMIT;
  const canCollapse = overflow > 0;
  const shown = expanded || !canCollapse ? children : children.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="flex min-w-0 flex-1 items-start gap-1.5">
      <ul
        className={`flex min-w-0 flex-1 items-center gap-1.5 py-0.5 ${
          expanded
            ? "max-h-24 flex-wrap overflow-y-auto"
            : "overflow-x-auto"
        }`}
      >
        {shown}
      </ul>
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? "参加者リストを畳む" : `全${total}人を表示`}
          className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {expanded ? "畳む ▴" : `+${overflow} ▾`}
        </button>
      )}
    </div>
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
  // 退出直後、サーバー側スナップショット（最大45秒前のポーリング結果）にはまだ
  // 自分が含まれている。「本当に退出できたのか」と不安にさせるため、
  // サーバーが追いつくまでの間は自分を表示から除く。
  const [leftIdentity, setLeftIdentity] = useState<string | null>(null);
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
    setLeftIdentity(null);
    let pending: Room | null = null;
    try {
      const res = await fetch(`/api/community/${topicId}/voice-token`);
      const data = (await res.json().catch(() => null)) as
        | (Partial<TokenResponse> & { error?: string })
        | null;
      if (!res.ok || !data?.token || !data.wsUrl) {
        setError(data?.error ?? "harborトークに接続できませんでした");
        return;
      }
      if (typeof data.maxSpeakers === "number") setMaxSpeakers(data.maxSpeakers);
      const created = new Room({ adaptiveStream: false, dynacast: false });
      pending = created;
      // サーバー側から切断された（別タブでの参加・権限失効など）場合に状態を戻す。
      created.once(RoomEvent.Disconnected, () => {
        setRoom((cur) => (cur === created ? null : cur));
        // 別タブでの参加や権限失効で切断された場合も、自分が残って見えないようにする。
        const id = created.localParticipant.identity;
        if (id) setLeftIdentity(id);
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
        "harborトークに接続できませんでした（サーバーの設定・ネットワークをご確認ください）"
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
    // 先に自分を表示から除く（切断の完了やポーリングを待たせない）。
    const identity = cur.localParticipant.identity;
    if (identity) setLeftIdentity(identity);
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

  // 退出直後は自分を除いて表示する。ポーリングが追いつけば元々含まれなくなるため、
  // このフィルタは自然に無効化される（解除処理は不要）。再参加時は join() でクリアする。
  const visible = leftIdentity
    ? snapshot.filter((p) => p.userId !== leftIdentity)
    : snapshot;

  // 未参加。サーバー側スナップショットで「いま誰がいるか」を見せる。
  return (
    <div className="flex items-start gap-2">
      <RowLabel icon="🎧" />
      {visible.length === 0 ? (
        <span className="flex-1">
          <EmptyHint />
        </span>
      ) : (
        <ParticipantList>
          {visible.map((p) => (
            <Chip
              key={p.userId}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              isSpeaker={p.isSpeaker}
              isSelf={false}
            />
          ))}
        </ParticipantList>
      )}
      {error && (
        <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void join()}
        disabled={joining}
        title="harborトークに参加（聴くだけでもOK）"
        aria-label="harborトークに参加。聴くだけでも参加できます"
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

  // 画面共有トラック。ルーム内で同時に1つだけという前提なので先頭を見る。
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const screenTrack = screenTracks[0];
  const sharerIdentity = screenTrack?.participant.identity ?? null;
  const iAmSharing = sharerIdentity === localParticipant.identity;
  const someoneElseSharing = sharerIdentity !== null && !iAmSharing;
  const sharerName = screenTrack ? displayNameOf(screenTrack.participant) : "";
  const [screenPending, setScreenPending] = useState(false);
  const [viewing, setViewing] = useState(false);

  // 共有が終わったら視聴モーダルも閉じる（トラックが消えた後に空枠を残さない）。
  const hasScreenTrack = screenTrack !== undefined;
  if (viewing && !hasScreenTrack) setViewing(false);

  // ブラウザ標準の「共有を停止」で終了された場合も検知して、
  // サーバー側のロックを解放する（要件10）。
  useEffect(() => {
    if (!iAmSharing) return;
    const pub = screenTrack?.publication;
    const track = pub?.track;
    if (!track) return;
    const onEnded = () => {
      void fetch(`/api/community/${topicId}/voice-screenshare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: false }),
      }).catch(() => undefined);
    };
    track.on("ended", onEnded);
    return () => {
      track.off("ended", onEnded);
    };
  }, [iAmSharing, screenTrack, topicId]);

  async function toggleScreenShare() {
    if (screenPending) return;
    setError(null);
    setScreenPending(true);
    const start = !iAmSharing;
    try {
      if (!start) {
        await localParticipant.setScreenShareEnabled(false);
        await fetch(`/api/community/${topicId}/voice-screenshare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ share: false }),
        }).catch(() => undefined);
        return;
      }

      // 先にサーバーへロックを要求する（同時押しはここで弾かれる）。
      const res = await fetch(`/api/community/${topicId}/voice-screenshare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: true }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "画面共有を開始できませんでした");
        return;
      }

      try {
        // 権限の反映を待ってから publish する（届く前に出すと弾かれる）。
        await waitForScreenSharePermission(localParticipant);
        await localParticipant.setScreenShareEnabled(
          true,
          SCREEN_CAPTURE,
          SCREEN_PUBLISH
        );
      } catch (e) {
        // ロック取得後に publish が失敗（選択のキャンセル・権限拒否など）したら
        // 必ずロックを解放する。放置すると誰も共有できなくなる（要件18）。
        await fetch(`/api/community/${topicId}/voice-screenshare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ share: false }),
        }).catch(() => undefined);
        const canceled =
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "AbortError");
        // 選択ダイアログのキャンセルはエラー表示しない（ユーザーの意図的な操作）。
        if (!canceled) {
          console.error("screen share publish error", e);
          setError("画面共有を開始できませんでした");
        }
      }
    } finally {
      setScreenPending(false);
    }
  }

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
    <div className="flex items-start gap-2">
      <RowLabel icon={canPublish ? "🎙" : "🎧"} />
      <ParticipantList>
        {participants.map((p) => (
          <LiveChip
            key={p.identity || p.sid}
            participant={p}
            isSelf={p.identity === localParticipant.identity}
          />
        ))}
      </ParticipantList>

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

      {/* 他の人が共有中: 任意で見る。押すまで映像は表示しない（音声だけで聴き続けられる）。 */}
      {someoneElseSharing && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          title={`${sharerName}さんが画面を共有しています`}
          className={`${ROW_BUTTON} bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200`}
        >
          🖥 画面を見る
        </button>
      )}

      {/* 発言権を持つ人だけが共有できる。他の人が共有中は出さない。 */}
      {canPublish && !someoneElseSharing && (
        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          disabled={screenPending}
          title={iAmSharing ? "画面共有を停止" : "画面を共有する"}
          className={`${ROW_BUTTON} ${
            iAmSharing
              ? "bg-indigo-600 text-white hover:bg-indigo-500"
              : "border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          {iAmSharing ? "🖥 共有を停止" : "🖥 画面共有"}
        </button>
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

      {/* 視聴モーダル。閉じても共有者側の配信は止まらない。 */}
      {viewing && screenTrack && (
        <ScreenShareModal
          trackRef={screenTrack}
          sharerName={sharerName}
          onClose={() => setViewing(false)}
        />
      )}
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
