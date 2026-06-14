"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SmdCandidate } from "@/lib/smd";

// プロフィール編集画面の「SMDメタデータから同期」。
// 候補を取得 → 項目を選択 → 適用（サーバーが本人アドレスで再取得して反映）。
export function SmdSync({ address }: { address: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState<SmdCandidate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sel, setSel] = useState({
    applyName: true,
    applyImageUrl: true,
    applyUrl: false,
    applyNamespace: false,
  });
  const [applying, setApplying] = useState(false);

  if (!address) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Symbol アドレスが未設定のため SMD 同期は利用できません。
      </p>
    );
  }

  async function load() {
    setLoading(true);
    setMessage(null);
    setCandidate(null);
    try {
      const r = await fetch(`/api/smd?address=${address}`);
      const data = (await r.json()) as
        | { status: "ok"; candidate: SmdCandidate }
        | { status: "none" }
        | { status: "invalid"; reason: string };
      if (data.status === "ok") setCandidate(data.candidate);
      else if (data.status === "invalid")
        setMessage("SMDが見つかりましたが形式が正しくないため適用できません。");
      else setMessage("SMDプロフィールは見つかりませんでした。");
    } catch {
      setMessage("SMDの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    setApplying(true);
    setMessage(null);
    try {
      const r = await fetch("/api/smd/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sel),
      });
      const data = (await r.json().catch(() => null)) as
        | { ok?: boolean; applied?: string[]; error?: string }
        | null;
      if (!r.ok) {
        setMessage(data?.error ?? "適用に失敗しました。");
        return;
      }
      setMessage(`適用しました：${(data?.applied ?? []).join(", ")}`);
      setCandidate(null);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        {loading ? "取得中..." : "SMDメタデータから同期"}
      </button>
      {message && (
        <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
      )}
      {candidate && (
        <div className="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700">
          <div className="flex items-center gap-3">
            {candidate.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidate.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {candidate.name && <p>表示名: {candidate.name}</p>}
              {candidate.url && <p>Webサイト: {candidate.url}</p>}
              {candidate.namespace && <p>Namespace: {candidate.namespace}</p>}
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-xs">
            {candidate.name && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={sel.applyName} onChange={(e) => setSel({ ...sel, applyName: e.target.checked })} />表示名を適用</label>
            )}
            {candidate.imageUrl && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={sel.applyImageUrl} onChange={(e) => setSel({ ...sel, applyImageUrl: e.target.checked })} />プロフィール画像を適用</label>
            )}
            {candidate.url && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={sel.applyUrl} onChange={(e) => setSel({ ...sel, applyUrl: e.target.checked })} />WebサイトURLを適用</label>
            )}
            {candidate.namespace && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={sel.applyNamespace} onChange={(e) => setSel({ ...sel, applyNamespace: e.target.checked })} />Namespaceを表示する</label>
            )}
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="mt-3 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {applying ? "適用中..." : "選択した項目を適用"}
          </button>
        </div>
      )}
    </div>
  );
}
