import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reactionMeta } from "@/lib/thanks";
import { formatXym } from "@/lib/format";
import { ThanksButtons } from "@/components/thanks-buttons";
import { notificationText, notificationUrl } from "@/lib/notifications";
import { NotificationSettings } from "@/components/notification-settings";

export const metadata = { title: "通知" };

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/notifications");
  }
  const me = session.user.id;

  const notifications = await prisma.notification.findMany({
    where: { userId: me },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const [reactions, received] = await Promise.all([
    // 自分の記事への、他ユーザーのリアクション
    prisma.reaction.findMany({
      where: { post: { authorId: me }, userId: { not: me } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        createdAt: true,
        post: { select: { id: true, title: true } },
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            xymAddress: true,
          },
        },
        thanks: { select: { thanksType: true } },
      },
    }),
    // 自分が受け取った Thanks
    prisma.thanks.findMany({
      where: { receiverUserId: me },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        thanksType: true,
        amount: true,
        currency: true,
        txHash: true,
        createdAt: true,
        post: { select: { id: true, title: true } },
        sender: { select: { displayName: true } },
      },
    }),
  ]);

  // このページを開いた時点で全通知を既読化（ヘッダーの未読バッジをクリア）。
  await prisma.notification.updateMany({
    where: { userId: me, read: false },
    data: { read: true },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold">通知</h1>

      <details className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          通知設定
        </summary>
        <div className="border-t border-gray-200 px-4 py-4 dark:border-gray-800">
          <NotificationSettings />
        </div>
      </details>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">最近の通知</h2>
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            通知はまだありません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {notifications.map((n) => {
              const { title, body } = notificationText(n);
              const url = notificationUrl(n);
              return (
                <li key={n.id} className="py-3">
                  <Link href={url} className="block hover:underline">
                    <p className="text-sm font-medium">
                      {!n.read && (
                        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />
                      )}
                      {title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                      {body}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {formatDate(n.createdAt)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          あなたの記事へのリアクション
        </h2>
        {reactions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            まだリアクションはありません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {reactions.map((r) => {
              const meta = reactionMeta(r.type);
              return (
                <li key={r.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.user.avatarUrl || "/avatar-placeholder.svg"}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                      <span className="min-w-0">
                        <Link
                          href={`/users/${r.user.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.user.displayName}
                        </Link>{" "}
                        さんが {meta?.emoji}「{meta?.label}」とリアクション
                        <br />
                        <Link
                          href={`/posts/${r.post.id}`}
                          className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                        >
                          記事: {r.post.title}
                        </Link>
                        <span className="ml-2 text-xs text-gray-400">
                          {formatDate(r.createdAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="pl-8">
                    <ThanksButtons
                      reactionId={r.id}
                      receiverName={r.user.displayName}
                      receiverAddress={r.user.xymAddress}
                      sentType={r.thanks?.thanksType ?? null}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">受け取った Thanks</h2>
        {received.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            まだありません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {received.map((t) => (
              <li key={t.id} className="py-3 text-sm">
                <p>
                  <span className="font-medium">
                    {t.sender?.displayName ?? "匿名"}
                  </span>{" "}
                  さんから{" "}
                  <span className="font-semibold text-amber-600">
                    {t.thanksType === "super_thanks" ? "Super Thanks" : "Thanks!"}
                  </span>{" "}
                  が届きました 🎉
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  記事:{" "}
                  <Link href={`/posts/${t.post.id}`} className="hover:underline">
                    {t.post.title}
                  </Link>
                  ・{formatXym(Number(t.amount))} {t.currency}・
                  {formatDate(t.createdAt)}・
                  <a
                    href={`https://testnet.symbol.fyi/transactions/${t.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    tx
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
