"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

type NotifItem = {
  id: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 45_000;
const SEEN_KEY = "nagexym.notif.lastSeen";

// ログイン中、定期的に通知をポーリングし、許可済みなら未表示分をブラウザ通知する。
// Service Worker の registration.showNotification を使用（Android 等で必須）。
export function NotificationManager() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const userId = session?.user?.id;

  // SW 登録（一度だけ）。
  useEffect(() => {
    if (!userId) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [userId]);

  // ポーリング。前回以降に作成された通知をブラウザ通知する。
  useEffect(() => {
    if (!userId) return;

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/notifications/list");
        if (!res.ok) return;
        const data = (await res.json()) as { items: NotifItem[] };
        if (!active || data.items.length === 0) return;

        const lastSeen = window.localStorage.getItem(SEEN_KEY) ?? "";
        const newest = data.items
          .map((n) => n.createdAt)
          .sort()
          .at(-1)!;

        // createdAt が前回基準より後のものを新着とみなす（既読/未読は問わない）。
        const fresh = data.items
          .filter((n) => n.createdAt > lastSeen)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        window.localStorage.setItem(SEEN_KEY, newest);

        // 初回（基準未設定）は履歴全件を通知しない。基準だけ記録して終了。
        if (!lastSeen) return;
        if (typeof Notification === "undefined" || Notification.permission !== "granted")
          return;
        if (!("serviceWorker" in navigator)) return;

        const reg = await navigator.serviceWorker.ready;
        for (const n of fresh) {
          try {
            await reg.showNotification(n.title, {
              body: n.body,
              tag: n.id,
              data: { url: n.url },
              icon: "/og-default.png",
              badge: "/og-default.png",
            });
          } catch (e) {
            console.error("showNotification failed", e);
          }
        }
      } catch {
        /* ignore */
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, pathname]);

  return null;
}
