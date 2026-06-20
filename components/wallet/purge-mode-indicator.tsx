"use client";

import { useEffect, useState } from "react";
import {
  isPurgeMode,
  purgeAwareSignOut,
  PURGE_CHANGED_EVENT,
} from "@/lib/wallet/purge-session";

// パージモードでログイン中であることを常時バッジで明示する（機能C）。
// ログアウトボタンはパージ後始末（メモリ上の復号鍵破棄＋フラグ消去）を経て signOut する。
export function PurgeModeIndicator() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOn(isPurgeMode());
    const sync = () => setOn(isPurgeMode());
    window.addEventListener(PURGE_CHANGED_EVENT, sync);
    // 別タブでの変更にも追従（sessionStorage はタブ毎だが念のため）。
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PURGE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!on) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 bg-purple-700 px-4 py-2 text-xs text-white shadow-lg">
      <span className="font-semibold">🔒 パージモードでログイン中</span>
      <span className="hidden sm:inline opacity-90">
        ログアウト時にこの端末の一時データを消去します
      </span>
      <button
        type="button"
        onClick={() => purgeAwareSignOut({ callbackUrl: "/" })}
        className="rounded-md bg-white/20 px-3 py-1 font-medium hover:bg-white/30"
      >
        パージしてログアウト
      </button>
    </div>
  );
}
