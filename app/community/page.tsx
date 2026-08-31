import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site";
import { getLivekitConfig, listActiveVoiceRoomCounts } from "@/lib/livekit";
import { LiveTalkRefresher } from "@/components/community/live-talk-refresher";

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

  // いまharborTalkに人がいるトピック（トピックID → 人数）。
  // LiveKit 未設定なら空で、バッジも並べ替えも発生しない。
  const livekit = getLivekitConfig();
  const liveCounts = livekit ? await listActiveVoiceRoomCounts(livekit) : {};
  const liveIds = Object.keys(liveCounts);

  const topicSelect = {
    id: true,
    name: true,
    description: true,
    iconUrl: true,
    lastPostedAt: true,
    _count: { select: { messages: true } },
    messages: {
      where: { hidden: false },
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: { body: true, user: { select: { displayName: true } } },
    },
  };

  // アーカイブされていないトピックを最終投稿順（未投稿は作成日）に取得。
  const recent = await prisma.communityTopic.findMany({
    where: { archived: false },
    orderBy: [
      { lastPostedAt: { sort: "desc" as const, nulls: "last" as const } },
      { createdAt: "desc" as const },
    ],
    take: 100,
    select: topicSelect,
  });

  // harborTalk中のトピックが上位100件から漏れていたら拾い直す
  // （一過性のライブを取りこぼさないため）。
  const missingLiveIds = liveIds.filter(
    (id) => !recent.some((t) => t.id === id),
  );
  const missingLive = missingLiveIds.length
    ? await prisma.communityTopic.findMany({
        where: { archived: false, id: { in: missingLiveIds } },
        select: topicSelect,
      })
    : [];

  // harborTalk中を先頭へ。ライブ同士は人数の多い順、それ以外は元の順序を保つ。
  const topics = [...missingLive, ...recent].sort((a, b) => {
    const ca = liveCounts[a.id] ?? 0;
    const cb = liveCounts[b.id] ?? 0;
    if (ca !== cb) return cb - ca;
    return 0;
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* 人数が変わったときだけ再取得してバッジを最新に保つ */}
      {livekit && <LiveTalkRefresher initialCounts={liveCounts} />}
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
            const liveCount = liveCounts[t.id] ?? 0;
            return (
              <li key={t.id}>
                <Link
                  href={`/community/${t.id}`}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {t.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.iconUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg">
                        💬
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{t.name}</p>
                      {liveCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          <span
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"
                            aria-hidden="true"
                          />
                          🎧 harborTalk {liveCount}人
                        </span>
                      )}
                    </div>
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
