import Link from "next/link";
import { formatXym } from "@/lib/format";
import { StampPurchaseButton } from "@/components/stamp/stamp-purchase-button";
import type { StampCardData } from "@/lib/stamps";

// スタンプ1件の表示カード（ショップ/プロフィールで共用）。
// size: shop=120px / profile=80px の画像。
export function StampCard({
  stamp,
  currentUserId,
  owned,
  imgSize = 120,
}: {
  stamp: StampCardData;
  currentUserId: string | null;
  owned: boolean;
  imgSize?: number;
}) {
  const isOwn = currentUserId != null && stamp.author.id === currentUserId;

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stamp.imageUrl}
        alt={stamp.name}
        width={imgSize}
        height={imgSize}
        style={{ width: imgSize, height: imgSize }}
        className="rounded-md bg-gray-50 object-contain dark:bg-gray-900"
      />
      <p className="w-full truncate text-sm font-medium" title={stamp.name}>
        {stamp.name}
      </p>
      <Link
        href={`/users/${stamp.author.id}`}
        className="w-full truncate text-xs text-gray-500 hover:underline dark:text-gray-400"
      >
        {stamp.author.displayName ?? "（無名）"}
      </Link>
      <p className="text-xs font-semibold">{formatXym(stamp.price)} XYM</p>

      {isOwn ? (
        <span className="text-xs text-gray-400">自分のスタンプ</span>
      ) : owned ? (
        <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
          ✓ 所持済み
        </span>
      ) : currentUserId == null ? (
        <Link href="/login" className="text-xs text-amber-600 underline dark:text-amber-400">
          ログインして購入
        </Link>
      ) : stamp.author.xymAddress ? (
        <StampPurchaseButton
          stampId={stamp.id}
          name={stamp.name}
          authorName={stamp.author.displayName ?? "（無名）"}
          sellerAddress={stamp.author.xymAddress}
          price={stamp.price}
          size="sm"
        />
      ) : (
        <span className="text-xs text-gray-400">受取未登録</span>
      )}
    </div>
  );
}
