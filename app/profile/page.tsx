import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/profile-form";
import { SmdSync } from "@/components/auth/smd-sync";

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
      emailNotificationsEnabled: true,
      displayName: true,
      bio: true,
      xAccount: true,
      avatarUrl: true,
      websiteUrl: true,
      symbolAddress: true,
      symbolNamespace: true,
      did: true,
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

      <section className="mb-6 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">Symbol DID</p>
        <p className="mt-1 break-all font-mono text-xs">
          {user.did ?? user.symbolAddress ?? "未設定"}
        </p>
        {user.symbolNamespace && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Namespace: <span className="font-mono">{user.symbolNamespace}</span>
          </p>
        )}
      </section>

      <ProfileForm
        initial={{
          displayName: user.displayName,
          bio: user.bio ?? "",
          xAccount: user.xAccount ?? "",
          avatarUrl: user.avatarUrl ?? "",
          email: user.email ?? "",
          emailNotificationsEnabled: user.emailNotificationsEnabled,
          websiteUrl: user.websiteUrl ?? "",
          tokushoho: user.tokushoho ?? "",
          salesTerms: user.salesTerms ?? "",
        }}
      />

      <section className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">SMDプロフィール同期</h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Symbol チェーン上の social_meta_data から表示名・画像などを取り込みます（確認後に適用）。
        </p>
        <SmdSync address={user.symbolAddress} />
      </section>
    </main>
  );
}
