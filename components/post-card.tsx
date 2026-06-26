import Link from "next/link";
import { formatXym } from "@/lib/format";
import { TipperAvatars, type TipperInfo } from "@/components/tip/tipper-avatars";
import { statusMeta } from "@/lib/thanks-status";

export type PostCardData = {
  id: string;
  title: string;
  excerpt?: string; // 抜粋はサーバー側で算出して渡す（sanitize をクライアントに含めないため）
  coverImage: string | null;
  tags: string[];
  createdAt: Date | string;
  viewCount?: number;
  paid?: boolean;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  postType?: string;
  qaStatus?: string | null;
  comment?: string | null;
  ogpTitle?: string | null;
  ogpImageUrl?: string | null;
  ogpSiteName?: string | null;
  author: { displayName: string; avatarUrl: string | null };
  tippers?: TipperInfo[];
  tipperMoreCount?: number;
  thanksCount?: number;
  thanksStatus?: string;
  isArchived?: boolean;
};

function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(
    new Date(d)
  );
}

export function PostCard({
  post,
  tip,
}: {
  post: PostCardData;
  tip?: { total: number; count: number };
}) {
  const isUrl = post.postType === "external_url";
  const isQa = post.postType === "qa";
  const thumb = isUrl ? post.ogpImageUrl : post.coverImage;
  const heading = isUrl ? post.ogpTitle || post.title : post.title;
  const excerpt = post.excerpt ?? "";

  // Harbor Thanks ステータスバッジ。docked（停泊中）は省略。Archive を優先表示。
  const status = post.thanksStatus ? statusMeta(post.thanksStatus) : null;
  const showStatusBadge =
    post.isArchived || (status !== null && status.key !== "docked");
  const thanksCount = post.thanksCount ?? 0;

  return (
    <li className="overflow-hidden border-b border-gray-200 transition hover:border-gray-300 max-sm:last:border-b-0 sm:rounded-lg sm:border dark:border-gray-800 dark:hover:border-gray-700">
      {/* スマホ: 横並び（左サムネ・右情報）/ sm以上: 縦カード */}
      <Link href={`/posts/${post.id}`} className="flex h-full flex-row sm:flex-col">
        <div className="m-3 aspect-video w-28 shrink-0 self-start overflow-hidden rounded bg-gray-100 sm:m-0 sm:w-full sm:self-auto sm:rounded-none dark:bg-gray-800">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="select-none text-xs font-bold tracking-widest text-gray-300 sm:text-2xl dark:text-gray-700">
                Harbor
              </span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-3">
          {isUrl && (
            <span className="mb-1 self-start rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              🔗 外部リンク
            </span>
          )}
          {isQa && (
            <span className="mb-1 flex flex-wrap items-center gap-1">
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                Q&amp;A
              </span>
              {post.qaStatus === "answered" ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
                  解決済み
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  未回答
                </span>
              )}
            </span>
          )}
          {post.paid && (
            <span className="mb-1 self-start rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              有料
              {post.priceAmount
                ? ` ${formatXym(Number(post.priceAmount))} ${post.priceCurrency ?? "XYM"}`
                : ""}
            </span>
          )}
          <h2 className="line-clamp-2 text-sm font-semibold">{heading}</h2>
          <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
            {excerpt}
          </p>
          {tip && tip.count > 0 && (
            <span className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <span>
                {formatXym(tip.total)} XYM・{tip.count}件
              </span>
              {(post.tippers?.length ?? 0) > 0 && (
                <>
                  {/* 金額テキストとアイコンスタックの区切り */}
                  <span
                    className="h-3 w-px shrink-0 bg-amber-300 dark:bg-amber-700"
                    aria-hidden="true"
                  />
                  <TipperAvatars
                    tippers={post.tippers ?? []}
                    moreCount={post.tipperMoreCount ?? 0}
                    variant="card"
                    showCrown={false}
                  />
                </>
              )}
            </span>
          )}
          <div className="mt-auto pt-2">
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.author.avatarUrl || "/avatar-placeholder.svg"}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
              />
              <span className="truncate">{post.author.displayName}</span>
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {formatDate(post.createdAt)}・👁 {post.viewCount ?? 0}
              {thanksCount > 0 && <>・🎁 Thanks × {thanksCount}</>}
            </p>
            {(showStatusBadge || post.tags.length > 0) && (
              <p className="mt-1 flex flex-wrap items-center gap-1">
                {/* 航海ステータス/Archive バッジ。タグと同じ行に並べる（カバー画像に被せない）。 */}
                {showStatusBadge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                      post.isArchived
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                    }`}
                  >
                    {post.isArchived
                      ? "⚓ Archive"
                      : `${status!.emoji} ${status!.label}`}
                  </span>
                )}
                {post.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  >
                    #{t}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
