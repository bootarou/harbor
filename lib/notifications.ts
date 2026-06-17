import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";

export type NotificationType =
  | "tip_received"
  | "comment"
  | "reaction"
  | "purchase"
  | "new_post"
  | "follow";

// 種別の定義（ラベルと既定 ON/OFF）。設定画面・正規化に使う。
export const NOTIFICATION_TYPES: {
  key: NotificationType;
  label: string;
  default: boolean;
}[] = [
  { key: "tip_received", label: "投げ銭を受け取った", default: true },
  { key: "comment", label: "コメントがついた", default: true },
  { key: "reaction", label: "いいねされた", default: false },
  { key: "purchase", label: "記事が売れた", default: true },
  { key: "new_post", label: "フォロー中の著者が新記事を投稿", default: false },
  { key: "follow", label: "フォロワーが増えた", default: false },
];

export type NotificationPrefs = Record<NotificationType, boolean>;

export function defaultPrefs(): NotificationPrefs {
  return NOTIFICATION_TYPES.reduce((acc, t) => {
    acc[t.key] = t.default;
    return acc;
  }, {} as NotificationPrefs);
}

// 任意の値を安全に NotificationPrefs へ正規化（未設定キーは既定値）。
export function normalizePrefs(raw: unknown): NotificationPrefs {
  const prefs = defaultPrefs();
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const t of NOTIFICATION_TYPES) {
      if (typeof obj[t.key] === "boolean") prefs[t.key] = obj[t.key] as boolean;
    }
  }
  return prefs;
}

export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });
  return normalizePrefs(u?.notificationPrefs);
}

type NotifyInput = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  actorName?: string | null;
  postId?: string | null;
  postTitle?: string | null;
  amount?: number | null;
  currency?: string | null;
};

// 通知をメールでも送る（メール登録済み＆メール通知ON の受信者のみ）。
// 種別ごとの ON/OFF（notificationPrefs）はブラウザ通知と共通で、呼び出し側が
// 既にフィルタ済みであることを前提とする。失敗してもトリガー側を止めない。
async function sendNotificationEmail(
  to: string,
  n: {
    type: string;
    actorName: string | null;
    postTitle: string | null;
    amount: Prisma.Decimal | number | null;
    currency: string | null;
    postId: string | null;
    actorId?: string | null;
  }
): Promise<void> {
  try {
    const { title, body } = notificationText(n);
    const link = absoluteUrl(notificationUrl(n));
    const text = [
      body,
      "",
      "▼ 確認する",
      link,
      "",
      "── このメールは ⚓Harbor のメール通知設定（ON）に基づき送信されています。",
      "通知の種類や受信ON/OFFはプロフィール設定から変更できます。",
    ].join("\n");
    await sendEmail({ to, subject: `[⚓Harbor] ${title}`, text });
  } catch (e) {
    console.error("notification email error", e);
  }
}

// 1人へ通知を作成（受信者の設定で OFF なら作らない）。失敗してもトリガー側を止めない。
// メール登録済み＆メール通知ON のユーザーには、同じ種別設定に従ってメールも送る。
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        notificationPrefs: true,
        email: true,
        emailNotificationsEnabled: true,
      },
    });
    const prefs = normalizePrefs(u?.notificationPrefs);
    if (!prefs[input.type]) return;
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        postId: input.postId ?? null,
        postTitle: input.postTitle ?? null,
        amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
        currency: input.currency ?? null,
      },
    });
    if (u?.email && u.emailNotificationsEnabled) {
      await sendNotificationEmail(u.email, {
        type: input.type,
        actorName: input.actorName ?? null,
        postTitle: input.postTitle ?? null,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        postId: input.postId ?? null,
        actorId: input.actorId ?? null,
      });
    }
  } catch (e) {
    console.error("notify error", e);
  }
}

// フォロー中著者の新規公開記事を、new_post を ON にしているフォロワー全員へ通知。
export async function notifyFollowersNewPost(args: {
  authorId: string;
  authorName: string;
  postId: string;
  postTitle: string;
}): Promise<void> {
  try {
    const follows = await prisma.follow.findMany({
      where: { followingId: args.authorId },
      select: {
        follower: {
          select: {
            id: true,
            notificationPrefs: true,
            email: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    });
    const recipients = follows
      .map((f) => f.follower)
      .filter((u) => normalizePrefs(u.notificationPrefs).new_post);
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        type: "new_post",
        actorId: args.authorId,
        actorName: args.authorName,
        postId: args.postId,
        postTitle: args.postTitle,
      })),
    });
    // メール登録済み＆メール通知ON のフォロワーにはメールでも通知。
    for (const u of recipients) {
      if (u.email && u.emailNotificationsEnabled) {
        await sendNotificationEmail(u.email, {
          type: "new_post",
          actorName: args.authorName,
          postTitle: args.postTitle,
          amount: null,
          currency: null,
          postId: args.postId,
          actorId: args.authorId,
        });
      }
    }
  } catch (e) {
    console.error("notifyFollowersNewPost error", e);
  }
}

// 通知の遷移先 URL。
export function notificationUrl(n: {
  type: string;
  postId: string | null;
  actorId?: string | null;
}): string {
  // フォロー通知は新フォロワーのプロフィールへ。
  if (n.type === "follow") return n.actorId ? `/users/${n.actorId}` : "/notifications";
  if (n.postId) return `/posts/${n.postId}`;
  return "/notifications";
}

// 表示・ブラウザ通知用のタイトル/本文。
export function notificationText(n: {
  type: string;
  actorName: string | null;
  postTitle: string | null;
  amount: Prisma.Decimal | number | null;
  currency: string | null;
}): { title: string; body: string } {
  const who = n.actorName ?? "誰か";
  const post = n.postTitle ?? "あなたの記事";
  const amt = n.amount != null ? `${Number(n.amount)} ${n.currency ?? "XYM"}` : "";
  switch (n.type) {
    case "tip_received":
      return { title: "投げ銭が届きました 🎉", body: `${amt} の投げ銭（${post}）` };
    case "comment":
      return { title: "新しいコメント", body: `${who} さんが「${post}」にコメントしました` };
    case "reaction":
      return { title: "リアクション", body: `${who} さんが「${post}」にいいねしました` };
    case "purchase":
      return { title: "記事が売れました 🛒", body: `「${post}」が購入されました（${amt}）` };
    case "new_post":
      return { title: "新着記事", body: `${who} さんが「${post}」を投稿しました` };
    case "follow":
      return { title: "新しいフォロワー", body: `${who} さんにフォローされました` };
    default:
      return { title: "通知", body: post };
  }
}
