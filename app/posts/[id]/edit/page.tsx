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
        postType: true,
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
        url: true,
        comment: true,
        tipsEnabled: true,
        ogpTitle: true,
        ogpDescription: true,
        ogpImageUrl: true,
        ogpSiteName: true,
        pollClosesAt: true,
        pollOptions: { orderBy: { order: "asc" }, select: { label: true } },
        _count: { select: { pollVotes: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { xymAddress: true, displayName: true },
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
          postType:
            post.postType === "external_url"
              ? "external_url"
              : post.postType === "qa"
                ? "qa"
                : "article",
          title: post.title,
          authorName: me?.displayName ?? "",
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
          url: post.url ?? "",
          comment: post.comment ?? "",
          tipsEnabled: post.tipsEnabled,
          ogp: post.ogpTitle || post.ogpImageUrl
            ? {
                title: post.ogpTitle ?? "",
                description: post.ogpDescription ?? "",
                imageUrl: post.ogpImageUrl ?? "",
                siteName: post.ogpSiteName ?? "",
                url: post.url ?? "",
              }
            : null,
          pollOptions: post.pollOptions.map((o) => o.label),
          pollClosesAt: toDatetimeLocal(post.pollClosesAt),
          pollLocked: post._count.pollVotes > 0,
        }}
      />
    </main>
  );
}
