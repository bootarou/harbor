import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 運営がコミュニティメッセージを完全削除する管理API（Bearer 認証）。
// 通報で hidden=true にして保持したログを、確認後に物理削除するために使う。
// 認証は ADMIN_SECRET（未設定なら 503）。
export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET が未設定です" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { messageId?: string }
    | null;
  const messageId = body?.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "messageId が必要です" }, { status: 400 });
  }

  const existing = await prisma.communityMessage.findUnique({
    where: { id: messageId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "メッセージが見つかりません" }, { status: 404 });
  }

  await prisma.communityMessage.delete({ where: { id: messageId } });
  return NextResponse.json({ ok: true, deleted: messageId });
}
