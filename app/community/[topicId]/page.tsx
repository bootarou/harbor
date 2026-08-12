import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTopicMessages } from "@/lib/community";
import { touchPresence, getActiveViewers } from "@/lib/community/presence";
import { getPlaceableStamps } from "@/lib/stamps";
import { absoluteUrl } from "@/lib/site";
import { ChatRoom } from "@/components/community/chat-room";
import { DeleteTopicButton } from "@/components/community/delete-topic-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topicId: string }>;
}): Promise<Metadata> {
  const { topicId } = await params;
  const topic = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    select: { name: true, description: true, iconUrl: true },
  });
  if (!topic) return { title: "コミュニティ" };

  const title = `${topic.name}｜港の広場`;
  const description =
    topic.description?.trim() ||
    `Harbor コミュニティの「${topic.name}」。港の広場で自由に会話しましょう。`;
  // アイコンがあれば OG 画像に、無ければサイト共通のフォールバックを使う（外部クローラー向けに絶対URL）。
  const images = [absoluteUrl(topic.iconUrl || "/og-default.png")];
  const url = absoluteUrl(`/community/${topicId}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  const topic = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
      archived: true,
      authorId: true,
    },
  });
  if (!topic) notFound();

  const isTopicAuthor = currentUserId === topic.authorId;

  const [messages, placeableStamps, me] = await Promise.all([
    getTopicMessages(topicId),
    getPlaceableStamps(currentUserId),
    currentUserId
      ? prisma.user.findUnique({
          where: { id: currentUserId },
          select: { displayName: true, avatarUrl: true },
        })
      : Promise.resolve(null),
  ]);

  // このページを開いたユーザーをオンラインとして記録し、初期のオンライン一覧を作る。
  if (currentUserId) {
    touchPresence(topicId, {
      userId: currentUserId,
      displayName: me?.displayName ?? null,
      avatarUrl: me?.avatarUrl ?? null,
    });
  }
  const initialOnline = getActiveViewers(topicId).map((v) => ({
    id: v.userId,
    displayName: v.displayName,
    avatarUrl: v.avatarUrl,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <nav className="mb-4 text-sm">
        <Link href="/community" className="text-gray-500 hover:underline dark:text-gray-400">
          ← 港の広場へ戻る
        </Link>
      </nav>

      <header className="mb-6 flex items-start gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          {topic.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={topic.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg">💬</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {topic.name}
            {topic.archived && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                アーカイブ済み
              </span>
            )}
          </h1>
          {topic.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
              {topic.description}
            </p>
          )}
        </div>
        {isTopicAuthor && (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <Link
              href={`/community/${topic.id}/edit`}
              className="rounded-md border border-gray-300 px-2.5 py-1 transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              編集
            </Link>
            <DeleteTopicButton topicId={topic.id} name={topic.name} />
          </div>
        )}
      </header>

      {topic.archived && (
        <p className="mb-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          このトピックはアーカイブされています（投稿すると自動的に再開します）。
        </p>
      )}

      <ChatRoom
        topicId={topic.id}
        initialMessages={messages}
        currentUserId={currentUserId}
        isTopicAuthor={isTopicAuthor}
        placeableStamps={placeableStamps}
        initialOnline={initialOnline}
      />
    </main>
  );
}
