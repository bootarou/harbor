import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm } from "@/components/post-form";

export const metadata = {
  title: "記事を書く",
};

export default async function NewPostPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/posts/new");
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { xymAddress: true, displayName: true },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">記事を書く</h1>
        <Link href="/dashboard" className="text-sm underline">
          マイ記事
        </Link>
      </div>
      <PostForm
        initial={{
          postType: "article",
          title: "",
          authorName: me?.displayName ?? "",
          contentHTML: "",
          coverImage: "",
          published: false,
          tags: [],
          paid: false,
          paidHtml: "",
          priceAmount: "",
          priceCurrency: "XYM",
          sellerAddress: "",
          publishAt: "",
          defaultSellerAddress: me?.xymAddress ?? "",
          url: "",
          comment: "",
          tipsEnabled: false,
          ogp: null,
          pollOptions: [],
          pollClosesAt: "",
          pollLocked: false,
        }}
      />
    </main>
  );
}
