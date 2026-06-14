export function SiteFooter() {
  const network =
    process.env.NEXT_PUBLIC_SYMBOL_NETWORK === "mainnet"
      ? "メインネット"
      : "テストネット";

  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl flex-col gap-1 px-6 py-6 text-xs text-gray-500 dark:text-gray-400">
        <p>Harbor — Symbol(XYM) 対応ノンカストディアル・ブログ</p>
        <p>
          現在のネットワーク: <span className="font-semibold">{network}</span>
          。秘密鍵・リカバリーフレーズはサーバーに保存されません。
        </p>
      </div>
    </footer>
  );
}
