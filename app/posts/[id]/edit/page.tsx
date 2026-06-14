import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm } from "@/components/post-form";

export const metadata = {
  title: "記事を編集",
};

// Date を datetime-local 入力用の "YYYY-MM-DDTHH:mm"（ローカル時刻）へ。
function toDatetimeLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/posts/${id}/edit`);
  }

  const [post, me] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        title: true,
        contentHTML: true,
        coverImage: true,
        published: true,
        tags: true,
        publishAt: true,
        paid: true,
        paidHtml: true,
        priceAmount: true,
        priceCurrency: true,
        sellerAddress: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { xymAddress: true },
    }),
  ]);

  if (!post) {
    notFound();
  }
  if (post.authorId !== session.user.id) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">記事を編集</h1>
        <Link href="/dashboard" className="text-sm underline">
          マイ記事
        </Link>
      </div>
      <PostForm
        initial={{
          id: post.id,
          title: post.title,
          contentHTML: post.contentHTML,
          coverImage: post.coverImage ?? "",
          published: post.published,
          tags: post.tags,
          paid: post.paid,
          paidHtml: post.paidHtml ?? "",
          priceAmount: post.priceAmount ? String(post.priceAmount) : "",
          priceCurrency: post.priceCurrency ?? "XYM",
          sellerAddress: post.sellerAddress ?? "",
          publishAt: toDatetimeLocal(post.publishAt),
          defaultSellerAddress: me?.xymAddress ?? "",
        }}
      />
    </main>
  );
}
