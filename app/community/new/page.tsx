import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TopicForm } from "@/components/community/topic-form";

export const metadata: Metadata = { title: "トピックを作成" };

export default async function NewTopicPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/community/new");
  }
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">トピックを作成</h1>
        <Link href="/community" className="text-sm underline">
          コミュニティへ
        </Link>
      </div>
      <TopicForm initial={{ name: "", description: "", iconUrl: "" }} />
    </main>
  );
}
