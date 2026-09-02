import "server-only";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  TwirpError,
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

/** LiveKit 管理APIのタイムアウト（秒）。SDK 既定の10秒では遅すぎる。 */
const LIVEKIT_REQUEST_TIMEOUT_SEC = 2;

/**
 * LiveKit が落ちている/到達できないとき、リクエストのたびにタイムアウトを
 * 待たされないようにするための一時停止。失敗したらこの時間だけ呼び出しを止め、
 * 即座に空を返す（表示系の機能なので、無いなら無いで描画を進めるほうがよい）。
 */
const LIVEKIT_FAILURE_BACKOFF_MS = 30_000;
let livekitDownUntil = 0;

/** 表示系の呼び出しを一時停止中か。 */
function isLivekitBackingOff(): boolean {
  return Date.now() < livekitDownUntil;
}

function noteLivekitFailure(): void {
  // 復旧の見込みが立つまでログを繰り返さないよう、停止に入る瞬間だけ記録する。
  // 「一時的にharborTalkが遅かった/バッジが出なかった」を後から追えるようにする。
  const wasHealthy = livekitDownUntil === 0;
  livekitDownUntil = Date.now() + LIVEKIT_FAILURE_BACKOFF_MS;
  if (wasHealthy) {
    console.warn(
      `[livekit] 到達できないため ${LIVEKIT_FAILURE_BACKOFF_MS / 1000}秒間 ` +
        "問い合わせを停止します（harborTalkの参加者表示・バッジは一時的に出ません）"
    );
  }
}

function noteLivekitSuccess(): void {
  if (livekitDownUntil !== 0) {
    console.info("[livekit] 到達を回復しました");
  }
  livekitDownUntil = 0;
}

let cachedClient: { httpUrl: string; client: RoomServiceClient } | null = null;

/** RoomServiceClient（設定ごとに使い回す）。 */
export function getRoomService(cfg: LivekitConfig): RoomServiceClient {
  if (cachedClient && cachedClient.httpUrl === cfg.httpUrl) return cachedClient.client;
  // 既定のリクエストタイムアウトは10秒。LiveKit に到達できないとページ描画が
  // まるごと10秒ブロックされるため、短く切って必ず速やかに諦めさせる。
  const client = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret, {
    requestTimeout: LIVEKIT_REQUEST_TIMEOUT_SEC,
  });
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

// 画面共有中のスピーカー。マイクに加えて画面共有（映像＋その音声）を許可する。
// カメラは一切許可しない。SCREEN_SHARE_AUDIO が無いと、共有者が「タブの音声も
// 共有」を選んでも LiveKit 側で publish が拒否される。
// 共有ロックを持つ人にだけこの権限を与えることで、同時1人をサーバー側で強制する。
const SCREEN_SHARER_PERMISSION: Partial<ParticipantPermission> = {
  canSubscribe: true,
  canPublish: true,
  canPublishData: true,
  canPublishSources: [
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
  ],
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

/** 未参加の閲覧者にも見せる、音声スペースの参加者表示用データ。 */
export type VoiceParticipantView = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** 発言権を持っている（マイクを持てる）か。 */
  isSpeaker: boolean;
  /** 画面共有中か。未参加の閲覧者にも「共有が行われている」と伝えるために使う。 */
  isSharing: boolean;
};

/** トークンに埋めた metadata を安全に読む（壊れていても落とさない）。 */
function parseMetadata(raw: string | undefined): Partial<VoiceParticipantMetadata> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<VoiceParticipantMetadata>;
  } catch {
    return {};
  }
}

/**
 * 参加者一覧を表示用に整形する。
 * LiveKit に接続していない閲覧者にも「いま誰が音声にいるか」を見せるために使う
 * （発言中かどうかはリアルタイム情報なので、接続中のクライアント側でのみ分かる）。
 */
export async function listVoiceParticipantViews(
  cfg: LivekitConfig,
  topicId: string
): Promise<VoiceParticipantView[]> {
  // 表示用なので、LiveKit が落ちている間は待たずに空で描画を進める。
  if (isLivekitBackingOff()) return [];
  const participants = await listVoiceParticipants(cfg, topicId);
  return participants.map((p) => {
    const meta = parseMetadata(p.metadata);
    return {
      userId: p.identity,
      displayName: meta.displayName ?? (p.name || null),
      avatarUrl: meta.avatarUrl ?? null,
      isSpeaker: p.permission?.canPublish === true,
      isSharing:
        p.tracks?.some((t) => t.source === TrackSource.SCREEN_SHARE) ?? false,
    };
  });
}

// トピック一覧（/community）用の人数スナップショット。
// listRooms() は1回の呼び出しで全ルームぶんが取れるため、トピックごとに
// listParticipants を叩かずに済む。匿名の閲覧者からも叩かれる経路なので、
// 短時間キャッシュして LiveKit への問い合わせが集中しないようにする。
let roomCountCache: { at: number; counts: Record<string, number> } | null = null;
const ROOM_COUNT_TTL = 15_000;

/**
 * いまharborTalkに人がいるトピックの人数を返す（トピックID → 人数）。
 * ルーム名は CommunityTopic.id なので、そのままキーとして使える。
 * LiveKit が応答しない場合は直前のキャッシュ、無ければ空を返す（一覧は落とさない）。
 */
export async function listActiveVoiceRoomCounts(
  cfg: LivekitConfig
): Promise<Record<string, number>> {
  const now = Date.now();
  if (roomCountCache && now - roomCountCache.at < ROOM_COUNT_TTL) {
    return roomCountCache.counts;
  }
  // LiveKit が落ちている間は呼びに行かない（待たされるだけなので即座に諦める）。
  if (isLivekitBackingOff()) return roomCountCache?.counts ?? {};
  try {
    const rooms = await getRoomService(cfg).listRooms();
    const counts: Record<string, number> = {};
    for (const r of rooms) {
      if (r.numParticipants > 0) counts[r.name] = r.numParticipants;
    }
    roomCountCache = { at: now, counts };
    noteLivekitSuccess();
    return counts;
  } catch {
    noteLivekitFailure();
    return roomCountCache?.counts ?? {};
  }
}

/** ルームの参加者一覧（ルーム未作成なら空配列）。 */
export async function listVoiceParticipants(
  cfg: LivekitConfig,
  topicId: string
): Promise<ParticipantInfo[]> {
  try {
    const list = await getRoomService(cfg).listParticipants(voiceRoomName(topicId));
    noteLivekitSuccess();
    return list;
  } catch (e) {
    // ルームがまだ存在しない場合もここに来る。これは LiveKit が応答している証拠
    // （TwirpError = HTTP 応答があった）なので、到達不能とは区別する。
    // ここを取り違えると、空のルームを開くたびに30秒バックオフしてしまう。
    if (e instanceof TwirpError) {
      noteLivekitSuccess();
    } else {
      noteLivekitFailure();
    }
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

// ── 画面共有の排他制御 ──────────────────────────────────────────
// 真実の情報源は LiveKit に publish されている ScreenShare トラック。
// 参加者が切断されればトラックも消えるため、ロックが残留しない。
// ただし「開始要求 → publish 完了」の間はトラックがまだ無く、2人が同時に
// 押すと両方が通ってしまう。その窓だけをインメモリの予約で塞ぐ。
// （ratelimit / presence と同じく単一サーバー前提）
const SCREEN_RESERVATION_TTL = 15_000;
const screenReservations = new Map<
  string,
  { identity: string; at: number }
>();

function activeReservation(room: string): string | null {
  const r = screenReservations.get(room);
  if (!r) return null;
  if (Date.now() - r.at > SCREEN_RESERVATION_TTL) {
    screenReservations.delete(room);
    return null;
  }
  return r.identity;
}

/** 実際に ScreenShare トラックを publish している参加者の identity。 */
function publishedSharer(participants: ParticipantInfo[]): string | null {
  for (const p of participants) {
    if (p.tracks?.some((t) => t.source === TrackSource.SCREEN_SHARE)) {
      return p.identity;
    }
  }
  return null;
}

export type ScreenShareState = {
  /** 共有中（または開始処理中）の identity。誰も共有していなければ null。 */
  identity: string | null;
};

/** ルームの画面共有状況（表示用）。 */
export async function getScreenShareState(
  cfg: LivekitConfig,
  topicId: string
): Promise<ScreenShareState> {
  const participants = await listVoiceParticipants(cfg, topicId);
  return { identity: publishedSharer(participants) ?? activeReservation(voiceRoomName(topicId)) };
}

export type ScreenShareResult =
  | { ok: true; identity: string | null }
  | { ok: false; error: string; status: number };

/**
 * 画面共有の開始／停止。開始は「誰も共有していない」ときだけ許可し、
 * 許可した相手にだけ SCREEN_SHARE の publish 権限を与える。
 * 権限で縛っているため、ロックを持たない参加者は publish 自体ができない。
 */
export async function setScreenShare(
  cfg: LivekitConfig,
  topicId: string,
  userId: string,
  share: boolean
): Promise<ScreenShareResult> {
  const room = voiceRoomName(topicId);
  return withRoomLock(room, async () => {
    const svc = getRoomService(cfg);
    const participants = await listVoiceParticipants(cfg, topicId);
    const me = participants.find((p) => p.identity === userId);
    if (!me) {
      return { ok: false as const, error: "harborトークに参加していません", status: 409 };
    }

    if (!share) {
      // 停止: 予約を解放し、権限をマイクのみに戻す（publish 中なら LiveKit が落とす）。
      if (screenReservations.get(room)?.identity === userId) {
        screenReservations.delete(room);
      }
      if (isSpeaker(me)) {
        await svc.updateParticipant(room, userId, { permission: SPEAKER_PERMISSION });
      }
      return { ok: true as const, identity: null };
    }

    // 開始には発言権が必要（発言できる人だけが画面共有できる）。
    if (!isSpeaker(me)) {
      return { ok: false as const, error: "発言中のみ画面共有できます", status: 403 };
    }

    const current = publishedSharer(participants) ?? activeReservation(room);
    if (current && current !== userId) {
      return {
        ok: false as const,
        error: "現在ほかのユーザーが画面を共有しています",
        status: 409,
      };
    }

    screenReservations.set(room, { identity: userId, at: Date.now() });
    await svc.updateParticipant(room, userId, { permission: SCREEN_SHARER_PERMISSION });
    return { ok: true as const, identity: userId };
  });
}

/** 発言権を失う・退出する際にロックを取りこぼさないための後始末。 */
function releaseScreenReservation(room: string, userId: string): void {
  if (screenReservations.get(room)?.identity === userId) {
    screenReservations.delete(room);
  }
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
        error: "harborトークに参加していません",
        status: 409,
      };
    }

    if (!speak) {
      // 発言権を失うと画面共有もできない。ロックを残さないよう必ず解放する
      // （権限が LISTENER になるため LiveKit 側も publish 中のトラックを落とす）。
      releaseScreenReservation(room, userId);
      if (isSpeaker(me)) {
        await svc.updateParticipant(room, userId, { permission: LISTENER_PERMISSION });
      }
      const speakers = participants.filter((p) => isSpeaker(p) && p.identity !== userId).length;
      return { ok: true as const, speakers };
    }

    if (isSpeaker(me)) {
      // すでにスピーカー（多重クリック等）。権限を上書きすると画面共有中の
      // SCREEN_SHARE 権限を奪ってしまうため、何もせず現状を返す。
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
