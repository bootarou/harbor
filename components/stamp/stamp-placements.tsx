import type { PostStampPlacement } from "@/lib/stamps";

// 記事に貼られたスタンプを枚数まとめで表示（64px）。0件なら呼び出し側で非表示にする。
export function StampPlacements({ placements }: { placements: PostStampPlacement[] }) {
  if (placements.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {placements.map((p) => (
        <div
          key={p.stampId}
          title={p.name}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-800 dark:bg-gray-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.imageUrl}
            alt={p.name}
            style={{ width: 64, height: 64 }}
            className="object-contain"
          />
          {p.count > 1 && (
            <span className="pr-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              ×{p.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
