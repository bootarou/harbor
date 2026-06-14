import { Suspense } from "react";
import { DidLogin } from "@/components/auth/did-login";

export const metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold">Harbor にログイン</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        ウォレット署名（Symbol DID）でログインします。メールアドレスは不要です。
      </p>
      <Suspense fallback={<p className="text-sm">読み込み中...</p>}>
        <DidLogin />
      </Suspense>
    </main>
  );
}
