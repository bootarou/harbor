import { Suspense } from "react";
import Link from "next/link";
import { RegisterFlow } from "@/components/auth/register-flow";

export const metadata = { title: "新規登録" };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold">Harbor をはじめる</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Symbol アドレスでアカウントを作成します（ノンカストディアル・秘密鍵はこの端末にのみ保存）。
      </p>
      <Suspense fallback={<p className="text-sm">読み込み中...</p>}>
        <RegisterFlow />
      </Suspense>
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        すでにウォレットをお持ちの方は{" "}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </main>
  );
}
