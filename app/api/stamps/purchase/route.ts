import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stampPurchaseSchema } from "@/lib/validations";
import { checkStampPurchaseTx } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";
import { notify } from "@/lib/notifications";

// スタンプ購入（＝使用権の取得）。有料記事購入(/api/purchases)と同じ検証パターン。
// クライアントが署名・アナウンスした送金(txHash)を、サーバーがノードで検証してから記録する。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = stampPurchaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }
  const { stampId, txHash } = parsed.data;

  const stamp = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: {
      id: true,
      name: true,
      price: true,
      published: true,
      authorId: true,
      author: { select: { xymAddress: true } },
    },
  });
  if (!stamp || !stamp.published) {
    return NextResponse.json(
      { error: "販売中のスタンプではありません" },
      { status: 400 }
    );
  }
  // 自己購入は不可（自分のスタンプは購入せず貼り付け可能）。
  if (stamp.authorId === session.user.id) {
    return NextResponse.json(
      { error: "自分のスタンプは購入できません" },
      { status: 400 }
    );
  }
  const sellerAddress = stamp.author.xymAddress;
  if (!sellerAddress) {
    return NextResponse.json(
      { error: "作者が受取アドレスを登録していません" },
      { status: 400 }
    );
  }

  // 既に購入済み（使用権あり）なら二重記録せず成功扱い。
  const already = await prisma.stampPurchase.findUnique({
    where: { stampId_buyerId: { stampId, buyerId: session.user.id } },
    select: { id: true, confirmed: true },
  });
  if (already) {
    return NextResponse.json({
      ok: true,
      alreadyPurchased: true,
      confirmed: already.confirmed,
    });
  }
  // 同じ txHash が記録済みなら成功扱い。
  const sameTx = await prisma.stampPurchase.findUnique({
    where: { txHash: txHash.toUpperCase() },
    select: { id: true },
  });
  if (sameTx) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  let check;
  try {
    check = await checkStampPurchaseTx({
      txHash,
      stampId,
      sellerAddress,
      priceAmount: Number(stamp.price),
    });
  } catch (e) {
    console.error("verify stamp purchase error", e);
    return NextResponse.json(
      {
        error: "ノードへの確認に失敗しました。少し待って再確認してください。",
        pending: true,
      },
      { status: 502 }
    );
  }

  if (check.status === "notfound") {
    return NextResponse.json(
      {
        pending: true,
        message:
          "送金はまだノードに反映されていません。再送信せず、しばらくして「再確認」してください。",
      },
      { status: 202 }
    );
  }
  if (check.status === "invalid") {
    return NextResponse.json(
      { error: `送金内容が条件と一致しません（${check.reason}）。` },
      { status: 409 }
    );
  }

  // 送金元(signer)がログインユーザー自身のウォレットであることを必須にする（横取り防止）。
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { symbolAddress: true, xymAddress: true, displayName: true },
  });
  const myAddresses = [me?.symbolAddress, me?.xymAddress].filter(Boolean);
  if (!myAddresses.includes(check.buyerAddress)) {
    return NextResponse.json(
      { error: "送金元アドレスがあなたのウォレットと一致しません" },
      { status: 403 }
    );
  }

  const jpyRate = await fetchXymJpyRate();

  try {
    await prisma.stampPurchase.create({
      data: {
        stampId,
        buyerId: session.user.id,
        amount: new Prisma.Decimal(check.amount),
        txHash: txHash.toUpperCase(),
        confirmed: check.confirmed,
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
    console.error("record stamp purchase error", error);
    return NextResponse.json(
      { error: "購入の記録に失敗しました" },
      { status: 500 }
    );
  }

  // スタンプ作者へ通知（postTitle にスタンプ名を入れる）。
  await notify({
    userId: stamp.authorId,
    type: "stamp_sold",
    actorId: session.user.id,
    actorName: me?.displayName ?? null,
    postTitle: stamp.name,
    amount: check.amount,
    currency: "XYM",
  });

  return NextResponse.json({ ok: true, confirmed: check.confirmed });
}
