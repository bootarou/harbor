// Harbor 通知用 Service Worker。
// ブラウザ通知の表示は registration.showNotification（Android Chrome 等で必須）。
// クリックで該当URLを開く/フォーカスする。

// 通知表示はページ側 navigator.serviceWorker.ready 経由の registration で行うため、
// clients.claim() で読み込み中のページを制御下に置く必要はない（ロード妨害を避ける）。
self.addEventListener("install", () => {
  self.skipWaiting();
});

// サーバーからの Web Push を受信して通知表示する（サイトを閉じていても届く）。
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "⚓Harbor";
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/notifications" },
    icon: "/og-default.png",
    badge: "/og-default.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 購読が失効・更新されたときに自動で再購読し、サーバーへ保存し直す。
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());
        const appServerKey = old && old.options && old.options.applicationServerKey;
        const sub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey || undefined,
          }));
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
        });
      } catch {
        // 再購読に失敗しても致命ではない（次回許可時に再登録される）。
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
