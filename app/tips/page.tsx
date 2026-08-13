import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyncTipsButton } from "@/components/tip/sync-tips-button";
import { formatXym } from "@/lib/format";
import { tipStatus, type TipStatus } from "@/lib/tips/status";
import { explorerTxUrl } from "@/lib/explorer";

export const metadata = { title: "投げ銭履歴" };

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

function StatusBadge({ status }: { status: TipStatus }) {
  if (status === "confirmed") {
    return (
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800 dark:bg-green-950 dark:text-green-200">
        確定
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span
        title="ネットワークの承認期限（約2時間）を過ぎたため着金を確認できませんでした"
        className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        期限切れ
      </span>
    );
  }
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      確認中
    </span>
  );
}

// 記事投げ銭とチャット投げ銭を統合した履歴の1件。
type HistoryItem = {
  id: string;
  title: string;
  href: string;
  chat: boolean; // チャット投げ銭バッジ用
  amount: number;
  confirmed: boolean;
  status: TipStatus;
  date: Date;
  txHash: string | null;
  anonymous?: boolean;
  who?: { name: string; id: string | null } | null; // 受取: 送信者
};

export default async function TipsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/tips");
  }
  const me = session.user.id;

  const [sentTips, receivedTips, sentCtips, receivedCtips] = await Promise.all([
    prisma.tip.findMany({
      where: { fromUserId: me },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        amount: true,
        anonymous: true,
        confirmed: true,
        confirmedAt: true,
        createdAt: true,
        txHash: true,
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
        createdAt: true,
        fromUser: { select: { id: true, displayName: true } },
        post: { select: { id: true, title: true } },
      },
    }),
    prisma.communityTip.findMany({
      where: { fromUserId: me },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        confirmed: true,
        createdAt: true,
        txHash: true,
        topicId: true,
        message: { select: { topic: { select: { name: true } } } },
      },
    }),
    prisma.communityTip.findMany({
      where: { message: { userId: me } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        confirmed: true,
        createdAt: true,
        topicId: true,
        txHash: true,
        fromUser: { select: { id: true, displayName: true } },
        message: { select: { topic: { select: { name: true } } } },
      },
    }),
  ]);

  const sent: HistoryItem[] = [
    ...sentTips.map((t) => ({
      id: t.id,
      title: t.post.title,
      href: `/posts/${t.post.id}`,
      chat: false,
      amount: Number(t.amount),
      confirmed: t.confirmed,
      status: tipStatus(t),
      date: t.confirmedAt,
      txHash: t.txHash,
      anonymous: t.anonymous,
    })),
    ...sentCtips.map((t) => ({
      id: t.id,
      title: t.message.topic.name,
      href: `/community/${t.topicId}`,
      chat: true,
      amount: Number(t.amount),
      confirmed: t.confirmed,
      status: (t.confirmed ? "confirmed" : "pending") as TipStatus,
      date: t.createdAt,
      txHash: t.txHash,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const received: HistoryItem[] = [
    ...receivedTips.map((t) => ({
      id: t.id,
      title: t.post.title,
      href: `/posts/${t.post.id}`,
      chat: false,
      amount: Number(t.amount),
      confirmed: t.confirmed,
      status: tipStatus(t),
      date: t.confirmedAt,
      txHash: null,
      who: t.anonymous
        ? { name: "匿名", id: null }
        : t.fromUser
          ? { name: t.fromUser.displayName, id: t.fromUser.id }
          : { name: "不明", id: null },
    })),
    ...receivedCtips.map((t) => ({
      id: t.id,
      title: t.message.topic.name,
      href: `/community/${t.topicId}`,
      chat: true,
      amount: Number(t.amount),
      confirmed: t.confirmed,
      status: (t.confirmed ? "confirmed" : "pending") as TipStatus,
      date: t.createdAt,
      txHash: t.txHash,
      who: t.fromUser
        ? { name: t.fromUser.displayName, id: t.fromUser.id }
        : { name: "不明", id: null },
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // 合計は確定分のみ。
  const sentTotal = sent.filter((t) => t.confirmed).reduce((s, t) => s + t.amount, 0);
  const receivedTotal = received
    .filter((t) => t.confirmed)
    .reduce((s, t) => s + t.amount, 0);

  const ChatBadge = () => (
    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
      チャット
    </span>
  );

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
                  <Link href={t.href} className="truncate font-medium hover:underline">
                    {t.chat ? "💬 " : ""}
                    {t.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    {t.chat && <ChatBadge />}
                    <StatusBadge status={t.status} />
                    {formatDate(t.date)}
                    {t.anonymous && "・匿名"}
                    {t.txHash && (
                      <>
                        ・
                        <a
                          href={explorerTxUrl(t.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          tx
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">
                  {formatXym(t.amount)} XYM
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
                  <Link href={t.href} className="truncate font-medium hover:underline">
                    {t.chat ? "💬 " : ""}
                    {t.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    {t.chat && <ChatBadge />}
                    <StatusBadge status={t.status} />
                    {t.who?.id ? (
                      <Link
                        href={`/users/${t.who.id}`}
                        className="font-medium text-gray-700 hover:underline dark:text-gray-200"
                      >
                        {t.who.name}
                      </Link>
                    ) : (
                      t.who?.name ?? "不明"
                    )}
                    ・{formatDate(t.date)}
                    {t.txHash && (
                      <>
                        ・
                        <a
                          href={explorerTxUrl(t.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          tx
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-green-700 dark:text-green-300">
                  +{formatXym(t.amount)} XYM
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
