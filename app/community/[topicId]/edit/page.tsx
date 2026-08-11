import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopicForm } from "@/components/community/topic-form";

export const metadata: Metadata = { title: "トピックを編集" };

export default async function EditTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/community/${topicId}/edit`);
  }

  const topic = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    select: { id: true, authorId: true, name: true, description: true, iconUrl: true },
  });
  if (!topic) notFound();
  if (topic.authorId !== session.user.id) redirect(`/community/${topicId}`);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">トピックを編集</h1>
        <Link href={`/community/${topicId}`} className="text-sm underline">
          戻る
        </Link>
      </div>
      <TopicForm
        initial={{
          id: topic.id,
          name: topic.name,
          description: topic.description ?? "",
          iconUrl: topic.iconUrl ?? "",
        }}
      />
    </main>
  );
}
