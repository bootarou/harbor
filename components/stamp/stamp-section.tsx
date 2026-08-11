"use client";

import { useEffect, useState } from "react";
import { StampPicker } from "@/components/stamp/stamp-picker";
import { StampPlacements } from "@/components/stamp/stamp-placements";
import type { PlaceableStamp, PostStampPlacement } from "@/lib/stamps";

// 記事のスタンプUI（貼付ボタン＋貼られたスタンプ表示）。
// サーバーの集計を初期値に持ちつつ、貼付時は楽観的に即時反映する
// （router.refresh の再取得を待たずに表示が変わる）。
export function StampSection({
  postId,
  initialPlacements,
  placeable,
  isLoggedIn,
}: {
  postId: string;
  initialPlacements: PostStampPlacement[];
  placeable: PlaceableStamp[];
  isLoggedIn: boolean;
}) {
  const [placements, setPlacements] = useState<PostStampPlacement[]>(initialPlacements);

  // router.refresh 後にサーバーの最新集計を正として同期する（他者の貼付も反映）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacements(initialPlacements);
  }, [initialPlacements]);

  function onPlaced(stamp: PlaceableStamp) {
    setPlacements((prev) => {
      const i = prev.findIndex((p) => p.stampId === stamp.id);
      const next =
        i >= 0
          ? prev.map((p, idx) => (idx === i ? { ...p, count: p.count + 1 } : p))
          : [
              ...prev,
              {
                stampId: stamp.id,
                name: stamp.name,
                imageUrl: stamp.imageUrl,
                count: 1,
              },
            ];
      return [...next].sort((a, b) => b.count - a.count);
    });
  }

  return (
    <div className="mt-3">
      <StampPicker
        postId={postId}
        placeable={placeable}
        isLoggedIn={isLoggedIn}
        onPlaced={onPlaced}
      />
      <StampPlacements placements={placements} />
    </div>
  );
}
