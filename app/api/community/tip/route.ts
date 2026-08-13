import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { communityTipSchema } from "@/lib/validations";
import { verifyTransferByHash } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";
import { notify } from "@/lib/notifications";

// チャットのメッセージへの投げ銭記録。
// クライアントが署名・アナウンスした送金(txHash)を、サーバーがノードで検証してから記録する。
// - 送金先＝メッセージ投稿者の xymAddress をサーバー側で採用（クライアント申告は不採用）。
// - 金額/送金元はオンチェーンの値を採用、送金元＝ログイン本人を必須（横取り防止）。
// - message.tipTotal/tipCount を加算し、投稿者へ通知。収益にも計上される。
const TIP_MIN_XYM = 0.1;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const json = await request.json().catch(() => null);
  const parsed = communityTipSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }
  const { messageId, txHash } = parsed.data;

  const message = await prisma.communityMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      topicId: true,
      hidden: true,
      deletedAt: true,
      user: { select: { xymAddress: true } },
      topic: { select: { name: true } },
    },
  });
  if (!message || message.hidden || message.deletedAt) {
    return NextResponse.json({ error: "メッセージが見つかりません" }, { status: 404 });
  }
  if (message.userId === userId) {
    return NextResponse.json({ error: "自分の投稿には投げ銭できません" }, { status: 400 });
  }
  const toAddress = message.user.xymAddress;
  if (!toAddress) {
    return NextResponse.json(
      { error: "投稿者がXYMアドレスを設定していません" },
      { status: 400 }
    );
  }

  // 既に同じ tx が記録済みなら成功扱い（二重記録防止）。
  const sameTx = await prisma.communityTip.findUnique({
    where: { txHash: txHash.toUpperCase() },
    select: { id: true },
  });
  if (sameTx) {
    const m = await prisma.communityMessage.findUnique({
      where: { id: messageId },
      select: { tipTotal: true, tipCount: true },
    });
    return NextResponse.json({
      ok: true,
      alreadyRecorded: true,
      tipTotal: m ? Number(m.tipTotal) : 0,
      tipCount: m?.tipCount ?? 0,
    });
  }

  // オンチェーン検証（マーカー・宛先=投稿者・最低額）。金額/送金元は実TXの値を採用。
  let verified;
  try {
    verified = await verifyTransferByHash({
      txHash,
      requiredMarker: `nagexym:ctip:${messageId}`,
      recipientAddress: toAddress,
      minAmountXym: TIP_MIN_XYM,
    });
  } catch (e) {
    console.error("verify community tip error", e);
    return NextResponse.json(
      { error: "トランザクションの確認に失敗しました。少し待って再試行してください。" },
      { status: 502 }
    );
  }
  if (!verified) {
    return NextResponse.json(
      { error: "送金を確認できませんでした。反映を待って再試行してください。" },
      { status: 409 }
    );
  }

  // 送金元(signer)がログインユーザー自身のウォレットであることを必須にする（横取り防止）。
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { symbolAddress: true, xymAddress: true, displayName: true },
  });
  const myAddresses = [me?.symbolAddress, me?.xymAddress].filter(Boolean);
  if (!myAddresses.includes(verified.senderAddress)) {
    return NextResponse.json(
      { error: "送金元アドレスがあなたのウォレットと一致しません" },
      { status: 403 }
    );
  }

  const jpyRate = await fetchXymJpyRate();

  // 記録＋集計加算をトランザクションで実行。tipCount は「投げた人数」なので
  // このユーザーが初めて投げる場合のみ +1 する。
  let totals: { tipTotal: number; tipCount: number };
  try {
    totals = await prisma.$transaction(async (tx) => {
      const firstFromUser =
        (await tx.communityTip.count({ where: { messageId, fromUserId: userId } })) === 0;
      await tx.communityTip.create({
        data: {
          messageId,
          topicId: message.topicId,
          fromUserId: userId,
          fromAddress: verified.senderAddress,
          toAddress,
          amount: new Prisma.Decimal(verified.amount),
          txHash: txHash.toUpperCase(),
          confirmed: verified.confirmed,
          jpyRate: jpyRate != null ? new Prisma.Decimal(jpyRate) : null,
        },
      });
      const updated = await tx.communityMessage.update({
        where: { id: messageId },
        data: {
          tipTotal: { increment: verified.amount },
          ...(firstFromUser ? { tipCount: { increment: 1 } } : {}),
        },
        select: { tipTotal: true, tipCount: true },
      });
      return { tipTotal: Number(updated.tipTotal), tipCount: updated.tipCount };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }
    console.error("record community tip error", error);
    return NextResponse.json({ error: "投げ銭の記録に失敗しました" }, { status: 500 });
  }

  // 投稿者へ通知（postId フィールドにトピックIDを入れて該当トピックへ遷移させる）。
  await notify({
    userId: message.userId,
    type: "community_tip",
    actorId: userId,
    actorName: me?.displayName ?? null,
    postId: message.topicId,
    postTitle: message.topic.name,
    amount: verified.amount,
    currency: "XYM",
  });

  return NextResponse.json({
    ok: true,
    confirmed: verified.confirmed,
    tipTotal: totals.tipTotal,
    tipCount: totals.tipCount,
  });
}
