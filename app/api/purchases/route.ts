import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { purchaseSchema } from "@/lib/validations";
import { checkPurchaseTx } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";
import { notify } from "@/lib/notifications";

// 有料記事の購入記録（＝同じ txHash の「確認」を兼ねる。クライアントは再送信せず再確認する）。
// クライアントが署名・アナウンスした送金(txHash)を、サーバーがノードで検証してから記録する。
// - 反映待ち(notfound)は 202 { pending } を返し、購入ボタンは復活させず再確認させる。
// - 内容不一致(invalid)のみ 409 で失敗とする。
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
      authorId: true,
      title: true,
    },
  });
  if (!post || !post.paid || !post.sellerAddress || !post.priceAmount) {
    return NextResponse.json(
      { error: "販売中の記事ではありません" },
      { status: 400 }
    );
  }

  // 既に購入済み（別txで成立済み等）なら二重記録せず成功扱い（多重課金後の救済にもなる）。
  const already = await prisma.purchase.findFirst({
    where: { postId, buyerUserId: session.user.id },
    select: { id: true, confirmed: true },
  });
  if (already) {
    return NextResponse.json({ ok: true, alreadyPurchased: true, confirmed: already.confirmed });
  }
  // 同じ txHash が既に記録済み（ポーラー等が先に記録した場合）なら成功扱い。
  const sameTx = await prisma.purchase.findUnique({
    where: { txHash: txHash.toUpperCase() },
    select: { id: true },
  });
  if (sameTx) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  // オンチェーン状態を確認（短時間リトライ込み）。
  let check;
  try {
    check = await checkPurchaseTx({
      txHash,
      postId,
      sellerAddress: post.sellerAddress,
      priceAmount: Number(post.priceAmount),
    });
  } catch (e) {
    console.error("verify purchase error", e);
    return NextResponse.json(
      { error: "ノードへの確認に失敗しました。少し待って再確認してください。", pending: true },
      { status: 502 }
    );
  }

  // まだ反映されていない（伝播待ち）。失敗ではないので再送信させず、再確認を促す。
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
  // 反映されているが条件を満たさない（金額/送金先/マーカー不一致）→ 失敗。
  if (check.status === "invalid") {
    return NextResponse.json(
      { error: `送金内容が条件と一致しません（${check.reason}）。` },
      { status: 409 }
    );
  }

  // 送金元(signer)がログインユーザー自身のウォレットであることを必須にする（横取り防止）。
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { symbolAddress: true, xymAddress: true },
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
    await prisma.purchase.create({
      data: {
        postId,
        buyerUserId: session.user.id,
        buyerAddress: check.buyerAddress,
        sellerAddress: post.sellerAddress,
        amount: new Prisma.Decimal(check.amount),
        currency: post.priceCurrency ?? "XYM",
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
      // 同じ tx は記録済み。成立しているので成功扱い。
      return NextResponse.json({ ok: true, alreadyRecorded: true });
    }
    console.error("record purchase error", error);
    return NextResponse.json(
      { error: "購入の記録に失敗しました" },
      { status: 500 }
    );
  }

  // 販売者（著者）へ通知。
  if (post.authorId !== session.user.id) {
    const buyer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    });
    await notify({
      userId: post.authorId,
      type: "purchase",
      actorId: session.user.id,
      actorName: buyer?.displayName ?? null,
      postId,
      postTitle: post.title,
      amount: check.amount,
      currency: post.priceCurrency ?? "XYM",
    });
  }

  return NextResponse.json({ ok: true, confirmed: check.confirmed });
}
