import "server-only";
import { NextResponse } from "next/server";

// 単一サーバー向けのインメモリ・レート制限（固定ウィンドウ）。
// 自鯖ホスト + Cloudflare Tunnel 構成を想定。複数プロセス/スケールアウト時は
// 外部ストア（Redis 等）への差し替えが必要。
//
// クライアント IP は Cloudflare Tunnel 経由のため CF-Connecting-IP を優先する。
// ※ オリジンがトンネル以外から直接到達できないこと（FW で遮断）が前提。
//   直アクセス可能だとこれらのヘッダは偽装され得る。

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * key 単位で windowMs の間に limit 回まで許可する。
 * @returns ok=false のとき retryAfter（秒）を返す。
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Cloudflare Tunnel 経由の実クライアント IP を取得する。 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** 429 レスポンス（Retry-After 付き）。 */
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
