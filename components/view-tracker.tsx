"use client";

import { useEffect } from "react";

const KEY = "nagexym.viewed.v1";

// 記事閲覧時に1回だけ閲覧数をカウントする（同一ブラウザの再訪は localStorage で抑制）。
export function ViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (arr.includes(postId)) return;
      const next = [...arr, postId].slice(-1000);
      window.localStorage.setItem(KEY, JSON.stringify(next));
      void fetch(`/api/posts/${postId}/view`, { method: "POST" }).catch(
        () => {}
      );
    } catch {
      // localStorage 不可などは黙って無視
    }
  }, [postId]);

  return null;
}
