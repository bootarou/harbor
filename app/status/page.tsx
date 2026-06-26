import Link from "next/link";
import { unstable_cache } from "next/cache";
import { formatXym } from "@/lib/format";
import { getHomeHighlights } from "@/lib/home";
import {
  getHarborStatusCached,
  SAILED_MIN,
  DISCOVERY_MIN,
  type ProgressPostRow,
} from "@/lib/harbor-status";

export const metadata = {
  title: "Harbor Status | 港の管制塔",
  description: "Harbor全体の動きをひと目で。記事・Thanks・投げ銭の今を映す管制塔。",
};

// 認証不要のため放置すると build 時に静的プリレンダ（=DB必須）される。
// 都度レンダリングにし、重い集計は unstable_cache（5分）で負荷軽減する。
export const dynamic = "force-dynamic";

// ランキングはトップと同じ集計を流用し、データ層で 5 分キャッシュ。
const getHighlightsCached = unstable_cache(
  () => getHomeHighlights(),
  ["home-highlights-v1"],
  { revalidate: 300 }
);

export default async function HarborStatusPage() {
  const [s, highlights] = await Promise.all([
    getHarborStatusCached(),
    getHighlightsCached(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">🌊 Harbor Status</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          港の管制塔 — いま Harbor で何が起きているか
        </p>
      </header>

      {/* セクション1: Harbor Status */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-300">
          🌊 Harbor 全体
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="📝 記事数" value={s.publishedPosts} />
          <Stat label="🎁 Thanks" value={s.thanksTotal} />
          <Stat label="🚣 停泊中" value={s.statusCounts.docked} />
          <Stat label="⛵ 出航準備" value={s.statusCounts.preparing} />
          <Stat label="🚢 出港" value={s.statusCounts.sailed} />
          <Stat label="🌊 航海中" value={s.statusCounts.voyaging} />
          <Stat label="🏝 Discovery" value={s.statusCounts.discovery} />
          <Stat label="⚓ Harbor Archive" value={s.archiveCount} accent="amber" />
        </div>
      </section>

      {/* セクション2: Today's Harbor */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-300">
          ⚓ Today&apos;s Harbor
          <span className="ml-2 text-xs font-normal text-gray-400">
            今日（JST 0:00〜）
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="📝 新着記事" value={s.today.newPosts} accent="teal" />
          <Stat label="🎁 今日のThanks" value={s.today.thanks} accent="teal" />
          <Stat label="🚢 今日出港" value={s.today.sailed} accent="teal" />
          <Stat label="🏝 今日Discovery" value={s.today.discovery} accent="teal" />
        </div>
      </section>

      {/* セクション3/4: 進捗中の記事 */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProgressSection
          title="⛵ あと少しで出港"
          subtitle="応援すれば出港できる記事"
          rows={s.almostSailed}
          goal={SAILED_MIN}
          accent="teal"
          emptyText="出航準備中の記事はまだありません"
        />
        <ProgressSection
          title="🏝 Discovery目前"
          subtitle="新大陸発見をみんなで応援"
          rows={s.almostDiscovery}
          goal={DISCOVERY_MIN}
          accent="amber"
          emptyText="航海中の記事はまだありません"
        />
      </div>

      {/* セクション5: Harbor Archive ハイライト（0件は非表示） */}
      {s.archiveHighlight && (
        <section className="mb-10">
          <div className="rounded-lg border border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-5 dark:border-amber-700 dark:from-amber-950/40 dark:to-yellow-950/30">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-amber-800 dark:text-amber-200">
                ⚓ Harbor Archive
              </h2>
              <Link
                href="/archive"
                className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
              >
                Archiveをすべて見る →
              </Link>
            </div>
            <p className="mb-3 text-[11px] text-amber-700/80 dark:text-amber-300/80">
              Harborに刻まれた価値ある記事
            </p>
            <Link
              href={`/posts/${s.archiveHighlight.id}`}
              className="block hover:underline"
            >
              <span className="flex items-start gap-2">
                <span aria-hidden="true" className="text-xl">
                  ⚓
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-bold text-amber-900 dark:text-amber-100">
                    {s.archiveHighlight.title}
                  </span>
                  <span className="block truncate text-xs text-amber-700/80 dark:text-amber-300/80">
                    {s.archiveHighlight.author}
                  </span>
                </span>
              </span>
            </Link>
          </div>
        </section>
      )}

      {/* セクション6: ランキング */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-300">
          🏆 ランキング
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <RankCard title="🎁 投げ銭ランキング（今週）" empty={highlights.tipRanking.length === 0}>
            {highlights.tipRanking.map((r, i) => (
              <RankRow key={r.id} index={i} postId={r.id} title={r.title} author={r.author}>
                <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {formatXym(r.totalXym)} XYM
                </span>
              </RankRow>
            ))}
          </RankCard>
          <RankCard title="👀 アクセスランキング" empty={highlights.accessRanking.length === 0}>
            {highlights.accessRanking.map((r, i) => (
              <RankRow key={r.id} index={i} postId={r.id} title={r.title} author={r.author}>
                <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                  {r.viewCount} PV・♥{r.likes}
                </span>
              </RankRow>
            ))}
          </RankCard>
          <RankCard title="🔥 注目記事（過去7日）" empty={highlights.featured.length === 0}>
            {highlights.featured.map((r, i) => (
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
      </section>

      {/* セクション7: 投げ銭統計 */}
      <section className="mb-4">
        <h2 className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-300">
          🎁 投げ銭統計
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="累計投げ銭回数" value={s.tipStats.totalCount} unit="回" />
          <Stat label="今月の投げ銭回数" value={s.tipStats.monthCount} unit="回" />
          <Stat label="今日の投げ銭回数" value={s.tipStats.todayCount} unit="回" />
          <Stat label="投げ銭された記事数" value={s.tipStats.tippedPosts} unit="記事" />
          <Stat label="投げ銭したユーザー数" value={s.tipStats.tipperUsers} unit="人" />
          <Stat
            label="累計流通額"
            value={formatXym(s.tipStats.totalXym)}
            unit="XYM"
            accent="amber"
          />
          <Stat
            label="今月流通額"
            value={formatXym(s.tipStats.monthXym)}
            unit="XYM"
            accent="amber"
          />
        </div>
      </section>
    </main>
  );
}

// 数値カード。accent で枠・数字色を切り替える。
function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | string;
  unit?: string;
  accent?: "amber" | "teal";
}) {
  const border =
    accent === "amber"
      ? "border-amber-300 dark:border-amber-700"
      : accent === "teal"
        ? "border-teal-200 dark:border-teal-800"
        : "border-gray-200 dark:border-gray-800";
  const valueColor =
    accent === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : accent === "teal"
        ? "text-teal-700 dark:text-teal-300"
        : "";
  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueColor}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-gray-400">{unit}</span>
        )}
      </p>
    </div>
  );
}

// 進捗（残りThanks）リストセクション。goal はステータス到達に必要な Thanks 数。
function ProgressSection({
  title,
  subtitle,
  rows,
  goal,
  accent,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: ProgressPostRow[];
  goal: number;
  accent: "amber" | "teal";
  emptyText: string;
}) {
  const bar = accent === "amber" ? "bg-amber-500 dark:bg-amber-400" : "bg-teal-500 dark:bg-teal-400";
  const remainColor =
    accent === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : "text-teal-700 dark:text-teal-300";
  return (
    <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const remaining = Math.max(0, goal - r.thanksCount);
            const pct = Math.min(100, Math.max(0, Math.round((r.thanksCount / goal) * 100)));
            return (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/posts/${r.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {r.title}
                  </Link>
                  <span className={`shrink-0 text-xs font-semibold ${remainColor}`}>
                    あと {remaining} Thanks
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                    {r.thanksCount}/{goal}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {r.author}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
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
