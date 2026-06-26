import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { thanksApiSchema } from "@/lib/validations";
import { thanksAmount, THANKS_CONFIG } from "@/lib/thanks";
import { verifyTransferByHash } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";
import { statusForCount, statusMeta, statusRank } from "@/lib/thanks-status";
import { notify } from "@/lib/notifications";

// Thanks 送金の記録。投稿者(送信者)がリアクションした読者へ送った送金を、
// サーバーがノードで検証してから記録する（運営は送金を預からない）。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = thanksApiSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }
  const { reactionId, thanksType, txHash } = parsed.data;

  const reaction = await prisma.reaction.findUnique({
    where: { id: reactionId },
    select: {
      postId: true,
      userId: true,
      post: { select: { authorId: true } },
      user: { select: { id: true, xymAddress: true } },
      thanks: { select: { id: true } },
    },
  });
  if (!reaction) {
    return NextResponse.json({ error: "リアクションが見つかりません" }, { status: 404 });
  }
  // 送信できるのは記事の投稿者のみ。
  if (reaction.post.authorId !== session.user.id) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  if (reaction.userId === session.user.id) {
    return NextResponse.json(
      { error: "自分のリアクションには送れません" },
      { status: 400 }
    );
  }
  if (reaction.thanks) {
    return NextResponse.json(
      { error: "このリアクションには既に送信済みです" },
      { status: 409 }
    );
  }
  const receiverAddress = reaction.user.xymAddress;
  if (!receiverAddress) {
    return NextResponse.json(
      { error: "このユーザーは受取アドレスを設定していません" },
      { status: 400 }
    );
  }

  const expected = thanksAmount(thanksType);

  let verified;
  try {
    verified = await verifyTransferByHash({
      txHash,
      requiredMarker: `nagexym:thanks:${reactionId}`,
      recipientAddress: receiverAddress,
      minAmountXym: expected,
    });
  } catch (e) {
    console.error("verify thanks error", e);
    return NextResponse.json(
      { error: "トランザクションの確認に失敗しました。少し待って再試行してください。" },
      { status: 502 }
    );
  }
  if (!verified) {
    return NextResponse.json(
      { error: "送金を確認できませんでした。反映状況を確認し、少し待って再試行してください。" },
      { status: 409 }
    );
  }

  // 送金元(signer)が送信者(=投稿者)自身のウォレットであることを必須にする。
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { symbolAddress: true, xymAddress: true },
  });
  const myAddresses = [me?.symbolAddress, me?.xymAddress].filter(Boolean);
  if (!myAddresses.includes(verified.senderAddress)) {
    return NextResponse.json(
      { error: "送金元アドレスがあなたのウォレットと一致しません" },
      { status: 403 }
    );
  }

  const jpyRate = await fetchXymJpyRate();

  try {
    await prisma.thanks.create({
      data: {
        reactionId,
        postId: reaction.postId,
        senderUserId: session.user.id,
        receiverUserId: reaction.user.id,
        senderAddress: verified.senderAddress,
        receiverAddress,
        thanksType,
        amount: new Prisma.Decimal(verified.amount),
        currency: THANKS_CONFIG.currency,
        txHash: txHash.toUpperCase(),
        status: verified.confirmed ? "confirmed" : "pending",
        jpyRate: jpyRate != null ? new Prisma.Decimal(jpyRate) : null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }
    console.error("record thanks error", error);
    return NextResponse.json({ error: "Thanks の記録に失敗しました" }, { status: 500 });
  }

  // Harbor Thanks: 送金は一切変更せず、記事の成長指標（thanksCount/ステータス）を更新する。
  // ステータスが上がったら著者へ通知（status_up）。失敗しても Thanks 記録自体は成功扱い。
  await updatePostThanksStatus(reaction.postId);

  revalidatePath("/notifications");
  return NextResponse.json({ ok: true, confirmed: verified.confirmed });
}

// 対象記事の送信済み Thanks 件数を集計してステータスを再計算・保存する。
// ※ Thanks の確定ポーラーは無く pending が確定へ遷移しないため、件数は
//   「記録済み（オンチェーン検証済み）の Thanks 行数」= 感謝した読者数 を採用する。
async function updatePostThanksStatus(postId: string): Promise<void> {
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, title: true, thanksStatus: true },
    });
    if (!post) return;

    const thanksCount = await prisma.thanks.count({ where: { postId } });
    const newStatus = statusForCount(thanksCount);

    await prisma.post.update({
      where: { id: postId },
      data: { thanksCount, thanksStatus: newStatus },
    });

    if (statusRank(newStatus) > statusRank(post.thanksStatus)) {
      const meta = statusMeta(newStatus);
      await notify({
        userId: post.authorId,
        type: "status_up",
        postId,
        postTitle: post.title,
        // 通知本文「…が🚢出港しました！」用に絵文字＋ステータス名を渡す。
        actorName: `${meta.emoji}${meta.label}`,
      });
    }
  } catch (e) {
    console.error("updatePostThanksStatus error", e);
  }
}
