import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/profile-form";

export const metadata = {
  title: "プロフィール編集",
};

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/profile");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      displayName: true,
      bio: true,
      xAccount: true,
      avatarUrl: true,
      xymAddress: true,
      tokushoho: true,
      salesTerms: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">プロフィール編集</h1>
        <Link href="/" className="text-sm underline">
          トップへ
        </Link>
      </div>

      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        メールアドレス: {user.email}
      </p>

      <ProfileForm
        initial={{
          displayName: user.displayName,
          bio: user.bio ?? "",
          xAccount: user.xAccount ?? "",
          avatarUrl: user.avatarUrl ?? "",
          tokushoho: user.tokushoho ?? "",
          salesTerms: user.salesTerms ?? "",
        }}
      />

      <section className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
        <h2 className="text-sm font-semibold">XYM アドレス（公開）</h2>
        {user.xymAddress ? (
          <p className="mt-2 break-all font-mono text-sm">{user.xymAddress}</p>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            未設定です。Phase 5 のウォレット生成時に自動的に設定されます。
          </p>
        )}
      </section>
    </main>
  );
}
