import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { walletAddressSchema } from "@/lib/validations";

// ウォレットの「公開アドレス」のみをプロフィールに保存する。
// !!! 秘密鍵・ニーモニック・パスフレーズはこのエンドポイント（および全サーバー）で
//     受け取らない・保存しない・ログ出力しない。受け取るのは公開アドレスのみ。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = walletAddressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { xymAddress: parsed.data.address },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("save wallet address error", error);
    return NextResponse.json(
      { error: "アドレスの保存に失敗しました" },
      { status: 500 }
    );
  }
}
