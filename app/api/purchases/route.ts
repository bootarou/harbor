import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { purchaseSchema } from "@/lib/validations";
import { verifyPurchaseTx } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";

// 有料記事の購入記録。クライアントが署名・アナウンスした送金(txHash)を、
// サーバーがノードで検証してから記録する（運営は送金を預からない）。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = purchaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }
  const { postId, txHash } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      paid: true,
      priceAmount: true,
      priceCurrency: true,
      sellerAddress: true,
    },
  });
  if (!post || !post.paid || !post.sellerAddress || !post.priceAmount) {
    return NextResponse.json(
      { error: "販売中の記事ではありません" },
      { status: 400 }
    );
  }

  // オンチェーン検証
  let verified;
  try {
    verified = await verifyPurchaseTx({
      txHash,
      postId,
      sellerAddress: post.sellerAddress,
      priceAmount: Number(post.priceAmount),
    });
  } catch (e) {
    console.error("verify purchase error", e);
    return NextResponse.json(
      { error: "トランザクションの確認に失敗しました。少し待って再試行してください。" },
      { status: 502 }
    );
  }
  if (!verified) {
    return NextResponse.json(
      {
        error:
          "送金を確認できませんでした。金額・送金先・反映状況を確認し、少し待って再試行してください。",
      },
      { status: 409 }
    );
  }

  // 送金元(signer)がログインユーザー自身のウォレットであることを必須にする。
  // これがないと、チェーン上で公開される他人の購入 txHash を先に送られて閲覧権を横取りされる。
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { symbolAddress: true, xymAddress: true },
  });
  const myAddresses = [me?.symbolAddress, me?.xymAddress].filter(Boolean);
  if (!myAddresses.includes(verified.buyerAddress)) {
    return NextResponse.json(
      { error: "送金元アドレスがあなたのウォレットと一致しません" },
      { status: 403 }
    );
  }

  const jpyRate = await fetchXymJpyRate();

  try {
    await prisma.purchase.create({
      data: {
        postId,
        buyerUserId: session.user.id,
        buyerAddress: verified.buyerAddress,
        sellerAddress: post.sellerAddress,
        amount: new Prisma.Decimal(verified.amount),
        currency: post.priceCurrency ?? "XYM",
        txHash: txHash.toUpperCase(),
        confirmed: verified.confirmed,
        jpyRate: jpyRate != null ? new Prisma.Decimal(jpyRate) : null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // 既に記録済み（同じ tx）。購入は成立しているので成功扱い。
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }
    console.error("record purchase error", error);
    return NextResponse.json(
      { error: "購入の記録に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, confirmed: verified.confirmed });
}
