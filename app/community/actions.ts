"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { sanitizePlainText } from "@/lib/sanitize";
import { communityMessageSchema, communityTopicSchema } from "@/lib/validations";
import { shapeMessage, type CommunityMessageView } from "@/lib/community";

export type TopicFormState = {
  error?: string;
  success?: { id: string };
};

const NOTIFY_EMAIL = process.env.REPORT_NOTIFY_EMAIL || "bootarouapp@gmail.com";

// トピック作成/更新（ログイン必須・作成は 5件/日）。
export async function saveTopic(
  _prev: TopicFormState,
  formData: FormData
): Promise<TopicFormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "ログインしてください。" };
  const userId = session.user.id;

  const parsed = communityTopicSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    iconUrl: formData.get("iconUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { name, description, iconUrl } = parsed.data;
  const data = {
    name,
    description: description ? description : null,
    iconUrl: iconUrl ? iconUrl : null,
  };

  const topicId = formData.get("topicId");
  try {
    if (typeof topicId === "string" && topicId.length > 0) {
      const existing = await prisma.communityTopic.findUnique({
        where: { id: topicId },
        select: { authorId: true },
      });
      if (!existing) return { error: "トピックが見つかりません" };
      if (existing.authorId !== userId) {
        return { error: "このトピックを編集する権限がありません" };
      }
      await prisma.communityTopic.update({ where: { id: topicId }, data });
      revalidatePath(`/community/${topicId}`);
      revalidatePath("/community");
      return { success: { id: topicId } };
    }
    // 作成のみレート制限（1ユーザー 5件/日）。
    const rl = rateLimit(`community-topic:${userId}`, 5, 24 * 60 * 60 * 1000);
    if (!rl.ok) {
      return { error: "トピック作成の上限（1日5件）に達しました。時間をおいて再試行してください。" };
    }
    const created = await prisma.communityTopic.create({
      data: { ...data, authorId: userId },
      select: { id: true },
    });
    revalidatePath("/community");
    return { success: { id: created.id } };
  } catch (e) {
    console.error("saveTopic error", e);
    return { error: "トピックの保存に失敗しました" };
  }
}

// トピック削除（作成者のみ・Cascade でメッセージも削除）。
export async function deleteTopic(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/community");
  const topicId = formData.get("topicId");
  if (typeof topicId !== "string" || !topicId) return;

  const existing = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    select: { authorId: true },
  });
  if (!existing || existing.authorId !== session.user!.id) return;

  // 投げ銭記録があるトピックは物理削除しない（収益・記録の保全）。
  // 代わりにアーカイブ（一覧から非表示）にして記録を残す。
  const tipCount = await prisma.communityTip.count({ where: { topicId } });
  if (tipCount > 0) {
    await prisma.communityTopic.update({
      where: { id: topicId },
      data: { archived: true },
    });
    redirect("/community");
  }

  await prisma.communityTopic.delete({ where: { id: topicId } });
  redirect("/community");
}

export type PostMessageResult =
  | { ok: true; message: CommunityMessageView }
  | { ok: false; error: string };

// メッセージ投稿（ログイン必須・1トピック 10件/分）。添付スタンプは購入済みのみ。
export async function postMessage(
  topicId: string,
  bodyRaw: string,
  stampIdRaw?: string
): Promise<PostMessageResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "ログインしてください。" };
  const userId = session.user.id;

  const parsed = communityMessageSchema.safeParse({
    body: bodyRaw,
    stampId: stampIdRaw ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力を確認してください" };
  }

  // 本文はタグ除去（プレーンテキスト化）。スタンプ単体投稿では空を許容する。
  const body = sanitizePlainText(parsed.data.body ?? "");

  const rl = rateLimit(`community-msg:${userId}:${topicId}`, 10, 60 * 1000);
  if (!rl.ok) {
    return { ok: false, error: "投稿が多すぎます。少し待ってから送ってください。" };
  }

  const topic = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    select: { id: true },
  });
  if (!topic) return { ok: false, error: "トピックが見つかりません" };

  // 添付スタンプは使用権を持つもののみ許可（購入済み confirmed ＋ 自作スタンプ）。
  let stampId: string | null = null;
  const reqStampId = parsed.data.stampId;
  if (reqStampId) {
    const stamp = await prisma.stamp.findUnique({
      where: { id: reqStampId },
      select: { authorId: true },
    });
    if (!stamp) return { ok: false, error: "スタンプが見つかりません" };
    if (stamp.authorId !== userId) {
      const owned = await prisma.stampPurchase.findFirst({
        where: { stampId: reqStampId, buyerId: userId },
        select: { id: true },
      });
      if (!owned) return { ok: false, error: "そのスタンプの使用権がありません" };
    }
    stampId = reqStampId;
  }

  // 本文もスタンプも無ければ投稿しない（本文がタグのみでサニタイズ後に空になった場合など）。
  if (!body && !stampId) {
    return { ok: false, error: "メッセージかスタンプを入力してください" };
  }

  const created = await prisma.communityMessage.create({
    data: { topicId, userId, body, stampId },
    select: {
      id: true,
      body: true,
      createdAt: true,
      userId: true,
      tipTotal: true,
      tipCount: true,
      user: {
        select: { id: true, displayName: true, avatarUrl: true, xymAddress: true },
      },
      stamp: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  // 最終投稿時刻の更新＋アーカイブ解除（投稿があれば復帰）。
  await prisma.communityTopic.update({
    where: { id: topicId },
    data: { lastPostedAt: created.createdAt, archived: false },
  });

  // 投げ銭記録の保全のためメッセージは物理削除しない（表示は最新100件の窓）。
  return { ok: true, message: shapeMessage(created) };
}

// メッセージ削除（投稿者本人 または トピック作成者）。
// 論理削除（deletedAt）。チャットからは非表示になるが、投げ銭記録・収益では引き続き利用する。
export async function deleteMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "ログインしてください。" };
  const userId = session.user.id;

  const msg = await prisma.communityMessage.findUnique({
    where: { id: messageId },
    select: { userId: true, topicId: true, topic: { select: { authorId: true } } },
  });
  if (!msg) return { ok: false, error: "メッセージが見つかりません" };

  const canDelete = msg.userId === userId || msg.topic.authorId === userId;
  if (!canDelete) return { ok: false, error: "削除する権限がありません" };

  await prisma.communityMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}

// メッセージの通報（既存の通報フローを流用）。hidden=true にして運営へメール通知。
export async function reportMessage(
  messageId: string,
  reasonRaw: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "ログインしてください。" };

  const rl = rateLimit(`community-report:${session.user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return { ok: false, error: "通報が多すぎます。時間をおいて再試行してください。" };
  }

  const reason = (reasonRaw ?? "").trim().slice(0, 1000);
  const msg = await prisma.communityMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      topicId: true,
      createdAt: true,
      user: { select: { id: true, displayName: true, symbolAddress: true } },
    },
  });
  if (!msg) return { ok: false, error: "メッセージが見つかりません" };

  // 通報されたメッセージは非表示にする（DBには残す＝法的対応）。
  await prisma.communityMessage.update({
    where: { id: messageId },
    data: { hidden: true },
  });

  const reporter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, displayName: true, symbolAddress: true },
  });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const text = [
    "Harbor コミュニティのメッセージが通報されました（自動的に非表示化済み）。",
    "",
    `■ メッセージ`,
    `  ID: ${msg.id}`,
    `  トピック: ${siteUrl}/community/${msg.topicId}`,
    `  投稿日時: ${msg.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    `  本文: ${msg.body}`,
    "",
    `■ 投稿者`,
    `  表示名: ${msg.user.displayName}`,
    `  ユーザーID: ${msg.user.id}`,
    `  アドレス: ${msg.user.symbolAddress ?? "-"}`,
    "",
    `■ 通報者`,
    `  表示名: ${reporter?.displayName ?? "-"}`,
    `  ユーザーID: ${reporter?.id ?? "-"}`,
    "",
    `■ 理由`,
    `  ${reason || "(未記入)"}`,
  ].join("\n");
  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      subject: "[Harbor] コミュニティのメッセージが通報されました",
      text,
    });
  } catch (e) {
    console.error("community report email error", e);
  }

  revalidatePath(`/community/${msg.topicId}`);
  return { ok: true };
}
