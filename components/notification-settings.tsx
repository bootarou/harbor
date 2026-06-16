"use client";

import { useEffect, useState } from "react";

type TypeDef = { key: string; label: string; default: boolean };
type Prefs = Record<string, boolean>;

export function NotificationSettings() {
  const [types, setTypes] = useState<TypeDef[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
    fetch("/api/notifications/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs: Prefs; types: TypeDef[] } | null) => {
        if (d) {
          setTypes(d.types);
          setPrefs(d.prefs);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function toggle(key: string) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaved(false);
    setSaving(true);
    try {
      await fetch("/api/notifications/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: next }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function enableBrowser() {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted" && "serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  const [testMsg, setTestMsg] = useState<string | null>(null);
  async function sendTest() {
    setTestMsg(null);
    try {
      if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
        setTestMsg("この環境は通知に対応していません。");
        return;
      }
      if (Notification.permission !== "granted") {
        setTestMsg("先に通知を許可してください。");
        return;
      }
      await navigator.serviceWorker.register("/sw.js").catch(() => {});
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("テスト通知", {
        body: "これはテスト通知です。表示されれば設定は正常です。",
        icon: "/og-default.png",
        data: { url: "/notifications" },
      });
      setTestMsg("送信しました（表示されない場合はOS/ブラウザの通知設定をご確認ください）。");
    } catch (e) {
      setTestMsg(
        "表示に失敗しました: " + (e instanceof Error ? e.message : String(e))
      );
    }
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ブラウザ通知の許可 */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm font-semibold">ブラウザ通知</p>
        {permission === "unsupported" ? (
          <p className="mt-1 text-xs text-gray-500">
            この環境はブラウザ通知に対応していません。
          </p>
        ) : permission === "granted" ? (
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-xs text-green-700 dark:text-green-300">
              ✓ 許可済み（下でONにした種類が端末に通知されます）
            </p>
            <button
              type="button"
              onClick={sendTest}
              className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700"
            >
              テスト通知を送る
            </button>
            {testMsg && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{testMsg}</p>
            )}
          </div>
        ) : permission === "denied" ? (
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            ブロックされています。ブラウザのサイト設定で通知を許可してください。
          </p>
        ) : (
          <button
            type="button"
            onClick={enableBrowser}
            className="mt-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            ブラウザ通知を有効にする
          </button>
        )}
      </div>

      {/* 種類ごとの ON/OFF */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">通知する種類</p>
          <span className="text-xs text-gray-400">
            {saving ? "保存中..." : saved ? "保存しました" : ""}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {types.map((t) => (
            <li key={t.key} className="flex items-center justify-between py-2.5 text-sm">
              <span>{t.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!prefs[t.key]}
                onClick={() => toggle(t.key)}
                className={`relative h-6 w-11 rounded-full transition ${
                  prefs[t.key] ? "bg-green-500" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    prefs[t.key] ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-400">
          OFF の種類はサイト内通知・ベル・ブラウザ通知のいずれも届きません。
        </p>
      </div>
    </div>
  );
}
