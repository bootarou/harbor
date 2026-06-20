import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tipSchema } from "@/lib/validations";
import { fetchXymJpyRate } from "@/lib/rates";
import { verifyTransferByHash } from "@/lib/purchases/verify";

// 投げ銭トランザクションの記録。
// クライアントが署名・アナウンスした送金(txHash)を、サーバーがノードで検証してから記録する。
// - 送金先(toAddress)は記事著者の公開アドレスをサーバー側で採用（クライアント申告は不採用）。
// - 金額・送金元はオンチェーンの値を採用（クライアント申告は不採用）。
// - 送金元(signer)がログインユーザーの登録アドレスと一致することを必須にし、
//   公開 txHash の「横取り記録」を防ぐ。
// confirmed はこの時点の反映状況（着金ポーリングで後から確定に更新される）。
const TIP_MIN_XYM = 0.1;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = tipSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }

  const { postId, answerId, txHash, anonymous } = parsed.data;

  // 投げ銭の対象（記事 or 回答）を特定し、送金先アドレス・本人除外・マーカーを決める。
  let toAddress: string;
  let requiredMarker: string;
  if (answerId) {
    // 回答への投げ銭: 宛先は回答者、マーカーは回答用。postId は本文の所属記事と一致を確認。
    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      select: {
        postId: true,
        authorId: true,
        author: { select: { xymAddress: true } },
        post: { select: { published: true } },
      },
    });
    if (!answer || answer.postId !== postId || !answer.post.published) {
      return NextResponse.json({ error: "回答が見つかりません" }, { status: 404 });
    }
    if (!answer.author.xymAddress) {
      return NextResponse.json(
        { error: "回答者がXYMアドレスを設定していません" },
        { status: 400 }
      );
    }
    if (answer.authorId === session.user.id) {
      return NextResponse.json(
        { error: "自分の回答には投げ銭できません" },
        { status: 400 }
      );
    }
    toAddress = answer.author.xymAddress;
    requiredMarker = `nagexym:atip:${answerId}`;
  } else {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { published: true, authorId: true, author: { select: { xymAddress: true } } },
    });
    if (!post || !post.published) {
      return NextResponse.json({ error: "記事が見つかりません" }, { status: 404 });
    }
    if (!post.author.xymAddress) {
      return NextResponse.json(
        { error: "著者がXYMアドレスを設定していません" },
        { status: 400 }
      );
    }
    if (post.authorId === session.user.id) {
      return NextResponse.json(
        { error: "自分の記事には投げ銭できません" },
        { status: 400 }
      );
    }
    toAddress = post.author.xymAddress;
    requiredMarker = `nagexym:tip:${postId}`;
  }

  // オンチェーン検証（マーカー・宛先=著者or回答者・最低額）。金額/送金元は実トランザクションの値を採用。
  let verified;
  try {
    verified = await verifyTransferByHash({
      txHash,
      requiredMarker,
      recipientAddress: toAddress,
      minAmountXym: TIP_MIN_XYM,
    });
  } catch (e) {
    console.error("verify tip error", e);
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

  // 送金元(signer)がログインユーザー自身のウォレットであることを必須にする（横取り防止）。
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
    const tip = await prisma.tip.create({
      data: {
        postId,
        answerId: answerId ?? null,
        fromAddress: verified.senderAddress,
        toAddress,
        amount: new Prisma.Decimal(verified.amount),
        txHash: txHash.toUpperCase(),
        fromUserId: session.user.id,
        anonymous: anonymous ?? false,
        confirmed: verified.confirmed,
        jpyRate: jpyRate != null ? new Prisma.Decimal(jpyRate) : null,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: tip.id, confirmed: verified.confirmed }, { status: 201 });
  } catch (error) {
    // txHash 重複（二重記録）
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "このトランザクションは既に記録されています" },
        { status: 409 }
      );
    }
    console.error("record tip error", error);
    return NextResponse.json(
      { error: "投げ銭の記録に失敗しました" },
      { status: 500 }
    );
  }
}
