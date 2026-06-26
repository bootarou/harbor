import Link from "next/link";

export function SiteFooter() {
  const network =
    process.env.NEXT_PUBLIC_SYMBOL_NETWORK === "mainnet"
      ? "メインネット"
      : "テストネット";

  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-6 py-6 text-xs text-gray-500 dark:text-gray-400">
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/status" className="hover:underline">
            🌊 Harbor Status
          </Link>
          <Link href="/terms" className="hover:underline">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:underline">
            プライバシーポリシー
          </Link>
          <a
            href="https://github.com/bootarou/harbor"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            GitHub
          </a>
        </nav>
        <p>Harbor — Symbol(XYM) 対応ノンカストディアル・ブログ</p>
        <p>
          現在のネットワーク: <span className="font-semibold">{network}</span>
          。秘密鍵・リカバリーフレーズはサーバーに保存されません。
        </p>
      </div>
    </footer>
  );
}
