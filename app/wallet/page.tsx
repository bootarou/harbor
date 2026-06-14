import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WalletManager } from "@/components/wallet/wallet-manager";

export const metadata = {
  title: "ウォレット",
};

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/wallet");
  }

  // サーバーが保持するのは公開アドレスのみ。
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { xymAddress: true },
  });

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold">ウォレット（Symbol / XYM）</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        ノンカストディアル方式です。秘密鍵・リカバリーフレーズ・パスフレーズはサーバーに送信・保存されません。
        この端末のブラウザ内に暗号化して保存されます。
      </p>
      <WalletManager serverAddress={user?.xymAddress ?? null} />
    </main>
  );
}
