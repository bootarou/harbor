import "server-only";
import { prisma } from "@/lib/prisma";

export type AuthEvent =
  | "challenge_issued"
  | "did_login_success"
  | "did_login_failed"
  | "did_register"
  | "smd_synced"
  | "session_revoked";

// 認証関連イベントの監査ログ。失敗してもアプリ動作を止めない。
export async function authLog(
  eventType: AuthEvent,
  data: {
    userId?: string | null;
    address?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    detail?: string | null;
  } = {}
): Promise<void> {
  try {
    await prisma.authLog.create({
      data: {
        eventType,
        userId: data.userId ?? null,
        address: data.address ?? null,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        detail: data.detail ?? null,
      },
    });
  } catch (e) {
    console.error("authLog error", e);
  }
}

export function requestMeta(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  // Cloudflare Tunnel 経由のため CF-Connecting-IP を優先（オリジンはトンネル限定前提）。
  return {
    ip:
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: request.headers.get("user-agent"),
  };
}
