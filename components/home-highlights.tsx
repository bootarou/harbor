import Link from "next/link";
import type { HomeHighlights } from "@/lib/home";
import { formatXym } from "@/lib/format";

// サムネなし・小さめカード・テキスト中心のトップページ・ハイライト。
export function HomeHighlights({ data }: { data: HomeHighlights }) {
  const { tipRanking, accessRanking, featured, ticker } = data;

  return (
    <div className="mb-10 flex flex-col gap-6">
      {/* 投げ銭ティッカー */}
      {ticker.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
          <ul className="flex flex-col gap-1 text-xs">
            {ticker.slice(0, 6).map((t) => (
              <li key={t.id} className="truncate">
                <span className="mr-1">💴</span>
                <span className="font-medium">{t.who}</span> さんが「
                <Link href={`/posts/${t.postId}`} className="underline">
                  {t.title}
                </Link>
                」に <span className="font-semibold">{formatXym(t.amountXym)} XYM</span> を投げ銭
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 投げ銭ランキング（今週） */}
        <RankCard title="💴 投げ銭ランキング（今週）" empty={tipRanking.length === 0}>
          {tipRanking.map((r, i) => (
            <RankRow key={r.id} index={i} postId={r.id} title={r.title} author={r.author}>
              <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {formatXym(r.totalXym)} XYM
              </span>
            </RankRow>
          ))}
        </RankCard>

        {/* アクセスランキング */}
        <RankCard title="👁 アクセスランキング" empty={accessRanking.length === 0}>
          {accessRanking.map((r, i) => (
            <RankRow key={r.id} index={i} postId={r.id} title={r.title} author={r.author}>
              <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                {r.viewCount} PV・♥{r.likes}
              </span>
            </RankRow>
          ))}
        </RankCard>

        {/* 注目記事（過去7日） */}
        <RankCard title="🔥 注目記事（過去7日）" empty={featured.length === 0}>
          {featured.map((r, i) => (
            <RankRow key={r.id} index={i} postId={r.id} title={r.title} author={r.author}>
              {r.hot && (
                <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                  急上昇
                </span>
              )}
            </RankRow>
          ))}
        </RankCard>
      </div>
    </div>
  );
}

function RankCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      {empty ? (
        <p className="text-xs text-gray-400">データがありません</p>
      ) : (
        <ol className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
          {children}
        </ol>
      )}
    </section>
  );
}

function RankRow({
  index,
  postId,
  title,
  author,
  children,
}: {
  index: number;
  postId: string;
  title: string;
  author: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-4 shrink-0 text-right text-xs font-semibold text-gray-400">
        {index + 1}
      </span>
      <Link href={`/posts/${postId}`} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-sm">{title}</span>
        <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
          {author}
        </span>
      </Link>
      {children}
    </li>
  );
}
