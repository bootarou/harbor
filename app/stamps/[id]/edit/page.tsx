import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StampForm } from "@/components/stamp/stamp-form";

export const metadata: Metadata = { title: "スタンプを編集" };

export default async function EditStampPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/stamps/${id}/edit`);
  }

  const stamp = await prisma.stamp.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      name: true,
      description: true,
      imageUrl: true,
      price: true,
      published: true,
    },
  });
  if (!stamp) notFound();
  if (stamp.authorId !== session.user.id) redirect("/stamps/manage");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">スタンプを編集</h1>
        <Link href="/stamps/manage" className="text-sm underline">
          管理へ戻る
        </Link>
      </div>
      <StampForm
        initial={{
          id: stamp.id,
          name: stamp.name,
          description: stamp.description ?? "",
          imageUrl: stamp.imageUrl,
          price: String(Number(stamp.price)),
          published: stamp.published,
        }}
      />
    </main>
  );
}
