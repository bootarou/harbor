import Link from "next/link";
import { htmlToText } from "@/lib/sanitize";
import { formatXym } from "@/lib/format";

export type PostCardData = {
  id: string;
  title: string;
  contentHTML: string;
  coverImage: string | null;
  tags: string[];
  createdAt: Date;
  viewCount?: number;
  paid?: boolean;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  postType?: string;
  comment?: string | null;
  ogpTitle?: string | null;
  ogpImageUrl?: string | null;
  ogpSiteName?: string | null;
  author: { displayName: string; avatarUrl: string | null };
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(d);
}

export function PostCard({
  post,
  tip,
}: {
  post: PostCardData;
  tip?: { total: number; count: number };
}) {
  const isUrl = post.postType === "external_url";
  const thumb = isUrl ? post.ogpImageUrl : post.coverImage;
  const heading = isUrl ? post.ogpTitle || post.title : post.title;
  const excerpt = isUrl
    ? post.comment ?? ""
    : htmlToText(post.contentHTML, 80);

  return (
    <li className="overflow-hidden rounded-lg border border-gray-200 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700">
      <Link href={`/posts/${post.id}`} className="flex h-full flex-col">
        <div className="aspect-video w-full bg-gray-100 dark:bg-gray-800">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="select-none text-2xl font-bold tracking-widest text-gray-300 dark:text-gray-700">
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
            <span className="mt-2 self-start rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              💴 {formatXym(tip.total)} XYM・{tip.count}件
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
            </p>
            {post.tags.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
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
