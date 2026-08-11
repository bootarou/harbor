"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { placeStamp } from "@/app/stamps/actions";
import type { PlaceableStamp } from "@/lib/stamps";

// 記事に貼る「🎨 スタンプ」ボタン＋モーダル。所持スタンプを選ぶと即時に貼り付ける（送金なし）。
export function StampPicker({
  postId,
  placeable,
  isLoggedIn,
  onPlaced,
}: {
  postId: string;
  placeable: PlaceableStamp[];
  isLoggedIn: boolean;
  // 貼付成功時に呼ばれる（親が即時に楽観反映するため）。
  onPlaced?: (stamp: PlaceableStamp) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(stamp: PlaceableStamp) {
    setError(null);
    startTransition(async () => {
      const res = await placeStamp(stamp.id, postId);
      if (res.ok) {
        onPlaced?.(stamp);
        setOpen(false);
        // サーバー側の集計とも整合させる（他者の貼付も反映）。
        router.refresh();
      } else {
        setError(res.error ?? "貼り付けに失敗しました");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isLoggedIn) {
            router.push(`/login?callbackUrl=/posts/${postId}`);
            return;
          }
          setOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        🎨 <span>スタンプ</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">スタンプを貼る</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-500 underline"
              >
                閉じる
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {placeable.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>貼れるスタンプがありません。</p>
                <Link
                  href="/stamps"
                  className="mt-2 inline-block text-amber-600 underline dark:text-amber-400"
                >
                  スタンプを購入する →
                </Link>
              </div>
            ) : (
              <div className="grid max-h-72 grid-cols-4 gap-2 overflow-auto">
                {placeable.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={pending}
                    onClick={() => pick(s)}
                    title={s.name}
                    className="rounded-md border border-gray-200 p-1 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt={s.name}
                      style={{ width: 64, height: 64 }}
                      className="mx-auto object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
