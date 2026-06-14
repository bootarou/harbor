import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="mb-6 text-2xl font-bold">ログイン</h1>
      <Suspense fallback={<p className="text-sm">読み込み中...</p>}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        アカウントをお持ちでない方は{" "}
        <Link href="/register" className="underline">
          新規登録
        </Link>
      </p>
    </main>
  );
}
