import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-5xl font-bold">404</p>
      <h1 className="text-lg font-semibold">ページが見つかりません</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        お探しのページは存在しないか、非公開の可能性があります。
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        トップへ戻る
      </Link>
    </main>
  );
}
