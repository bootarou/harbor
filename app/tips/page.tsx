import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyncTipsButton } from "@/components/tip/sync-tips-button";
import { formatXym } from "@/lib/format";

export const metadata = { title: "投げ銭履歴" };

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function explorerUrl(hash: string): string {
  return `https://testnet.symbol.fyi/transactions/${hash}`;
}

function StatusBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800 dark:bg-green-950 dark:text-green-200">
      確定
    </span>
  ) : (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      確認中
    </span>
  );
}

export default async function TipsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/tips");
  }
  const me = session.user.id;

  const [sent, received] = await Promise.all([
    prisma.tip.findMany({
      where: { fromUserId: me },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        amount: true,
        anonymous: true,
        confirmed: true,
        confirmedAt: true,
        txHash: true,
        toAddress: true,
        post: { select: { id: true, title: true } },
      },
    }),
    prisma.tip.findMany({
      where: { post: { authorId: me } },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        amount: true,
        anonymous: true,
        confirmed: true,
        confirmedAt: true,
        fromAddress: true,
        fromUser: { select: { id: true, displayName: true } },
        post: { select: { id: true, title: true } },
      },
    }),
  ]);

  const sentTotal = sent.reduce((s, t) => s + Number(t.amount), 0);
  const receivedTotal = received.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">投げ銭履歴</h1>
        <SyncTipsButton />
      </div>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">送った投げ銭</h2>
          <span className="text-sm font-semibold">合計 {formatXym(sentTotal)} XYM</span>
        </div>
        {sent.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            まだ投げ銭していません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {sent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/posts/${t.post.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {t.post.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <StatusBadge confirmed={t.confirmed} />
                    {formatDate(t.confirmedAt)}
                    {t.anonymous && "・匿名"}・
                    <a
                      href={explorerUrl(t.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      tx
                    </a>
                  </p>
                </div>
                <span className="shrink-0 font-semibold">
                  {formatXym(Number(t.amount))} XYM
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">受け取った投げ銭</h2>
          <span className="text-sm font-semibold">合計 {formatXym(receivedTotal)} XYM</span>
        </div>
        {received.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            まだ受け取っていません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {received.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/posts/${t.post.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {t.post.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <StatusBadge confirmed={t.confirmed} />
                    {t.anonymous ? (
                      "匿名"
                    ) : t.fromUser ? (
                      <Link
                        href={`/users/${t.fromUser.id}`}
                        className="font-medium text-gray-700 hover:underline dark:text-gray-200"
                      >
                        {t.fromUser.displayName}
                      </Link>
                    ) : (
                      "不明"
                    )}
                    ・{formatDate(t.confirmedAt)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-green-700 dark:text-green-300">
                  +{formatXym(Number(t.amount))} XYM
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
