import "server-only";

// トピックごとの「いま閲覧している人」を追跡する軽量プレゼンス（インメモリ）。
// レート制限（lib/ratelimit.ts）と同じく単一サーバー前提。複数プロセス/スケールアウト時は
// 外部ストア（Redis 等）へ差し替えが必要。ログイン済みユーザーのみ対象（表示名を出すため）。

export type Viewer = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeen: number;
};

// クライアントへ返すオンライン閲覧者の形。
export type OnlineViewer = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
};

// この時間内に ping があれば「オンライン」とみなす。
const PRESENCE_TTL = 90_000; // 90秒
const rooms = new Map<string, Map<string, Viewer>>();

let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [topicId, viewers] of rooms) {
    for (const [uid, v] of viewers) {
      if (now - v.lastSeen > PRESENCE_TTL) viewers.delete(uid);
    }
    if (viewers.size === 0) rooms.delete(topicId);
  }
}

// 閲覧を記録（更新）する。
export function touchPresence(
  topicId: string,
  user: { userId: string; displayName: string | null; avatarUrl: string | null }
): void {
  const now = Date.now();
  sweep(now);
  let viewers = rooms.get(topicId);
  if (!viewers) {
    viewers = new Map();
    rooms.set(topicId, viewers);
  }
  viewers.set(user.userId, { ...user, lastSeen: now });
}

// いまオンライン（直近 PRESENCE_TTL 内）の閲覧者一覧。
export function getActiveViewers(topicId: string): Viewer[] {
  const now = Date.now();
  sweep(now);
  const viewers = rooms.get(topicId);
  if (!viewers) return [];
  return [...viewers.values()]
    .filter((v) => now - v.lastSeen <= PRESENCE_TTL)
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
