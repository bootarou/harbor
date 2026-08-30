import "server-only";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type ParticipantInfo,
  type ParticipantPermission,
} from "livekit-server-sdk";

// コミュニティの音声スペース（LiveKit）用のサーバー側ヘルパー。
// - ルーム名は CommunityTopic.id をそのまま使う（追加のデータモデルは不要）。
// - 参加者 identity は User.id（同一ユーザーの多重接続は LiveKit 側で古い方が切断される）。
// - 既定は「聴講者」。発言権（canPublish）はサーバーが最大5人まで付与する。
//
// LIVEKIT_* が未設定の環境では音声スペース機能ごと無効化する（既存デプロイに影響しない）。

/** 同時に発言できる人数の上限。 */
export const MAX_SPEAKERS = 5;

/** 参加トークンの有効期間。長時間の滞在でも再取得が要らない程度に取る。 */
const TOKEN_TTL = "2h";

export type LivekitConfig = {
  apiKey: string;
  apiSecret: string;
  /** クライアントが接続する WebSocket URL（ws:// または wss://）。 */
  wsUrl: string;
  /**
   * サーバー→LiveKit の管理API（Twirp）用 HTTP URL。
   * 既定は wsUrl から導出するが、LIVEKIT_API_URL があればそちらを優先する
   * （docker compose 内から `http://livekit:7880` へ直接叩く等）。
   */
  httpUrl: string;
};

/** ws(s):// を http(s):// に読み替える（LiveKit のサーバーAPIは同じホスト/ポート）。 */
function toHttpUrl(wsUrl: string): string {
  if (/^wss:\/\//i.test(wsUrl)) return wsUrl.replace(/^wss:/i, "https:");
  if (/^ws:\/\//i.test(wsUrl)) return wsUrl.replace(/^ws:/i, "http:");
  return wsUrl;
}

/**
 * LiveKit の設定を返す。未設定（＝音声スペース無効）なら null。
 */
export function getLivekitConfig(): LivekitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const wsUrl = process.env.LIVEKIT_WS_URL?.trim().replace(/\/+$/, "");
  if (!apiKey || !apiSecret || !wsUrl) return null;
  const apiUrl = process.env.LIVEKIT_API_URL?.trim().replace(/\/+$/, "");
  return {
    apiKey,
    apiSecret,
    wsUrl,
    httpUrl: apiUrl ? toHttpUrl(apiUrl) : toHttpUrl(wsUrl),
  };
}

/** 音声スペースが利用可能な環境か（サーバーコンポーネントからの判定用）。 */
export function isVoiceEnabled(): boolean {
  return getLivekitConfig() !== null;
}

/** トピック ID をそのまま LiveKit のルーム名として使う。 */
export function voiceRoomName(topicId: string): string {
  return topicId;
}

/** 参加者 metadata（クライアントに配られるため公開情報のみ）。 */
export type VoiceParticipantMetadata = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** 受取用の公開アドレス。将来の「発言者へ投げ銭」導線のために載せる。 */
  xymAddress: string | null;
};

/**
 * 聴講者として参加するトークンを発行する。
 * 発言権は POST /api/community/[topicId]/voice-speaker で後から付与する。
 */
export async function createVoiceToken(
  cfg: LivekitConfig,
  topicId: string,
  user: VoiceParticipantMetadata
): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: user.userId,
    name: user.displayName ?? undefined,
    metadata: JSON.stringify(user),
    ttl: TOKEN_TTL,
  });
  at.addGrant({
    roomJoin: true,
    room: voiceRoomName(topicId),
    // 既定は聴講者。発言はサーバーが権限を更新したときのみ可能になる。
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
    // 自分で metadata を書き換えられないようにする（なりすまし防止）。
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

let cachedClient: { httpUrl: string; client: RoomServiceClient } | null = null;

/** RoomServiceClient（設定ごとに使い回す）。 */
export function getRoomService(cfg: LivekitConfig): RoomServiceClient {
  if (cachedClient && cachedClient.httpUrl === cfg.httpUrl) return cachedClient.client;
  const client = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  cachedClient = { httpUrl: cfg.httpUrl, client };
  return client;
}

// マイクのみ publish 可（カメラ・画面共有は不可）。
const SPEAKER_PERMISSION: Partial<ParticipantPermission> = {
  canSubscribe: true,
  canPublish: true,
  canPublishData: true,
  canPublishSources: [TrackSource.MICROPHONE],
  hidden: false,
  recorder: false,
  canUpdateMetadata: false,
};

const LISTENER_PERMISSION: Partial<ParticipantPermission> = {
  canSubscribe: true,
  canPublish: false,
  canPublishData: true,
  canPublishSources: [],
  hidden: false,
  recorder: false,
  canUpdateMetadata: false,
};

/** 参加者が発言権を持っているか。 */
function isSpeaker(p: ParticipantInfo): boolean {
  return p.permission?.canPublish === true;
}

/** ルームの参加者一覧（ルーム未作成なら空配列）。 */
export async function listVoiceParticipants(
  cfg: LivekitConfig,
  topicId: string
): Promise<ParticipantInfo[]> {
  try {
    return await getRoomService(cfg).listParticipants(voiceRoomName(topicId));
  } catch {
    // ルームがまだ存在しない場合などはエラーになる。参加者ゼロとして扱う。
    return [];
  }
}

// ルーム単位の直列化。スピーカー上限のチェックと権限付与の間に割り込みが入ると
// 5人を超えて付与され得るため、同一ルームの更新は順番に実行する。
// レート制限やプレゼンスと同じく単一サーバー前提（スケールアウト時は外部ロックが必要）。
const roomLocks = new Map<string, Promise<unknown>>();

function withRoomLock<T>(room: string, fn: () => Promise<T>): Promise<T> {
  const prev = roomLocks.get(room) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const guard = run.catch(() => {});
  roomLocks.set(room, guard);
  void guard.then(() => {
    // 自分が最後尾のときだけ掃除する（後続が積まれていれば残す）。
    if (roomLocks.get(room) === guard) roomLocks.delete(room);
  });
  return run;
}

export type SpeakerResult =
  | { ok: true; speakers: number }
  | { ok: false; error: string; status: number };

/**
 * 発言権の付与／返却。付与は空きがある場合のみ（上限 MAX_SPEAKERS）。
 * 権限は atomically に更新されるため、望む権限をすべて指定する。
 */
export async function setSpeaker(
  cfg: LivekitConfig,
  topicId: string,
  userId: string,
  speak: boolean
): Promise<SpeakerResult> {
  const room = voiceRoomName(topicId);
  return withRoomLock(room, async () => {
    const svc = getRoomService(cfg);
    const participants = await listVoiceParticipants(cfg, topicId);
    const me = participants.find((p) => p.identity === userId);
    if (!me) {
      return {
        ok: false as const,
        error: "音声スペースに参加していません",
        status: 409,
      };
    }

    if (!speak) {
      if (isSpeaker(me)) {
        await svc.updateParticipant(room, userId, { permission: LISTENER_PERMISSION });
      }
      const speakers = participants.filter((p) => isSpeaker(p) && p.identity !== userId).length;
      return { ok: true as const, speakers };
    }

    if (isSpeaker(me)) {
      // すでにスピーカー（多重クリック等）。現状をそのまま返す。
      return { ok: true as const, speakers: participants.filter(isSpeaker).length };
    }
    const current = participants.filter(isSpeaker).length;
    if (current >= MAX_SPEAKERS) {
      return { ok: false as const, error: "スピーカーが満員です", status: 403 };
    }
    await svc.updateParticipant(room, userId, { permission: SPEAKER_PERMISSION });
    return { ok: true as const, speakers: current + 1 };
  });
}
