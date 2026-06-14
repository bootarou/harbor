import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tipSchema } from "@/lib/validations";
import { fetchXymJpyRate } from "@/lib/rates";

// 投げ銭トランザクションの記録。
// クライアントが署名・アナウンスした送金の控え（txHash 等）を受け取り記録する。
// 送金先(toAddress)は記事著者の公開アドレスをサーバー側で採用し、クライアントの申告は信用しない。
// ※ オンチェーンの最終確認（着金ポーリング）は Phase 7 で追加予定。
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

  const { postId, txHash, fromAddress, amount, anonymous } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true, authorId: true, author: { select: { xymAddress: true } } },
  });
  if (!post || !post.published) {
    return NextResponse.json({ error: "記事が見つかりません" }, { status: 404 });
  }
  const toAddress = post.author.xymAddress;
  if (!toAddress) {
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

  const jpyRate = await fetchXymJpyRate();

  try {
    const tip = await prisma.tip.create({
      data: {
        postId,
        fromAddress,
        toAddress,
        amount: new Prisma.Decimal(amount),
        txHash: txHash.toUpperCase(),
        fromUserId: session.user.id,
        anonymous: anonymous ?? false,
        jpyRate: jpyRate != null ? new Prisma.Decimal(jpyRate) : null,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: tip.id }, { status: 201 });
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
