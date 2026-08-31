import Link from "next/link";
import type { CommunityTickerItem } from "@/lib/community";
import { UserAvatar } from "@/components/user-avatar";

// トップの「コミュニティ」ティッカー。各トピックの最新メッセージを横に流し、
// クリックでそのトピックへジャンプ。CSS のみで自動スクロール（ホバーで一時停止・
// reduced-motion では停止）。シームレスなループのため items を2回描画する。
export function CommunityTicker({ items }: { items: CommunityTickerItem[] }) {
  if (items.length === 0) return null;

  const Chip = ({ it }: { it: CommunityTickerItem }) => (
    <Link
      href={`/community/${it.topicId}`}
      className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm transition hover:border-teal-400 hover:bg-teal-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-teal-700 dark:hover:bg-teal-950/40"
    >
      {/* ルームアイコン */}
      <span className="h-6 w-6 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
        {it.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.iconUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs">💬</span>
        )}
      </span>
      {/* ユーザーアイコン */}
      <UserAvatar
        src={it.userAvatar}
        alt=""
        className="h-5 w-5 shrink-0 rounded-full object-cover"
/>
      <span className="max-w-[16rem] truncate text-gray-700 dark:text-gray-300">
        <span className="font-medium">{it.userName ?? "誰か"}</span>
        <span className="text-gray-400">: </span>
        {it.snippet}
      </span>
    </Link>
  );

  return (
    <section className="mb-6" aria-label="コミュニティの新着">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">💬 コミュニティ</h2>
        <Link
          href="/community"
          className="text-xs text-gray-500 underline dark:text-gray-400"
        >
          港の広場へ →
        </Link>
      </div>
      {/* group で hover 時にアニメを一時停止 */}
      <div className="group relative overflow-hidden">
        <div className="ticker-track flex w-max gap-2 group-hover:[animation-play-state:paused]">
          {items.map((it, i) => (
            <Chip it={it} key={`a-${i}`} />
          ))}
          {/* ループ用の複製 */}
          {items.map((it, i) => (
            <Chip it={it} key={`b-${i}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
