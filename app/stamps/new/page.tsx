import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { StampForm } from "@/components/stamp/stamp-form";

export const metadata: Metadata = { title: "スタンプを作成" };

export default async function NewStampPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/stamps/new");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">スタンプを作成</h1>
        <Link href="/stamps/manage" className="text-sm underline">
          管理へ戻る
        </Link>
      </div>
      <StampForm
        initial={{
          name: "",
          description: "",
          imageUrl: "",
          price: "",
          published: false,
        }}
      />
    </main>
  );
}
