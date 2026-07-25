// クライアント用 Web Push ヘルパー。VAPID 公開鍵で購読し、サーバーへ保存する。
// 秘密情報は一切扱わない（公開鍵と購読 endpoint のみ）。

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// VAPID 公開鍵(base64url)を pushManager が要求する Uint8Array へ変換する。
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

// 現在のブラウザで push 購読を作成（既存があれば再利用）し、サーバーに保存する。
// 許可済み前提で呼ぶこと（permission が granted でない場合は subscribe が失敗する）。
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return false;
  try {
    await navigator.serviceWorker.register("/sw.js").catch(() => {});
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch (e) {
    console.error("subscribePush failed", e);
    return false;
  }
}

// 端末の push 購読を解除し、サーバーからも削除する。
export async function unsubscribePush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch (e) {
    console.error("unsubscribePush failed", e);
  }
}

// 既にこのブラウザに有効な push 購読があるか（重複通知の抑止判定に使う）。
export async function hasActivePushSubscription(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}
