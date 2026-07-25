import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// VAPID 設定。鍵が無い環境（未設定）では push を無効化する（メール/サイト内通知は継続）。
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

// 指定ユーザーの全購読へプッシュ送信する。失敗しても呼び出し側を止めない。
// 端末側で購読が失効（404/410）していたらその購読を削除する（宛先の掃除）。
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data
        );
      } catch (e) {
        const status =
          e && typeof e === "object" && "statusCode" in e
            ? (e as { statusCode?: number }).statusCode
            : undefined;
        // 失効した購読は削除（次回以降の無駄打ちを防ぐ）。
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: s.endpoint } })
            .catch(() => {});
        } else {
          console.error("web push send error", status ?? e);
        }
      }
    })
  );
}
