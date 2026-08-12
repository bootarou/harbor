import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site";

const COMMUNITY_TITLE = "港の広場（コミュニティ）";
const COMMUNITY_DESC =
  "Harbor の港の広場。トピックを立てて自由に会話できます。";

export const metadata: Metadata = {
  title: COMMUNITY_TITLE,
  description: COMMUNITY_DESC,
  alternates: { canonical: absoluteUrl("/community") },
  openGraph: {
    title: COMMUNITY_TITLE,
    description: COMMUNITY_DESC,
    url: absoluteUrl("/community"),
    type: "website",
    images: [absoluteUrl("/og-default.png")],
  },
  twitter: {
    card: "summary_large_image",
    title: COMMUNITY_TITLE,
    description: COMMUNITY_DESC,
    images: [absoluteUrl("/og-default.png")],
  },
};

function formatWhen(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

export default async function CommunityPage() {
  const session = await auth();

  // アーカイブされていないトピックを最終投稿順（未投稿は作成日）に表示。
  const topics = await prisma.communityTopic.findMany({
    where: { archived: false },
    orderBy: [{ lastPostedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
      lastPostedAt: true,
      _count: { select: { messages: true } },
      messages: {
        where: { hidden: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, user: { select: { displayName: true } } },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚓ 港の広場（コミュニティ）</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            トピックを立てて自由に会話できます。
          </p>
        </div>
        {session?.user && (
          <Link
            href="/community/new"
            className="shrink-0 rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            ＋ トピック作成
          </Link>
        )}
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          まだトピックがありません。最初のトピックを立ててみませんか？
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {topics.map((t) => {
            const latest = t.messages[0];
            return (
              <li key={t.id}>
                <Link
                  href={`/community/${t.id}`}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {t.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.iconUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg">
                        💬
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {latest
                        ? `${latest.user.displayName ?? "誰か"}: ${latest.body}`
                        : t.description || "まだ投稿がありません"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {t._count.messages} 投稿
                      {t.lastPostedAt ? `・${formatWhen(t.lastPostedAt)}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
