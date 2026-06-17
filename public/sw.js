// Harbor 通知用 Service Worker。
// ブラウザ通知の表示は registration.showNotification（Android Chrome 等で必須）。
// クリックで該当URLを開く/フォーカスする。

// 通知表示はページ側 navigator.serviceWorker.ready 経由の registration で行うため、
// clients.claim() で読み込み中のページを制御下に置く必要はない（ロード妨害を避ける）。
self.addEventListener("install", () => {
  self.skipWaiting();
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
