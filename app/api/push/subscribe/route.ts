import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PushSubscription の保存／削除（要ログイン）。
// クライアントの pushManager.subscribe() が返す購読情報のうち、
// 送信に必要な endpoint と暗号化用公開鍵(p256dh/auth)のみを受け取る。
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "不正な購読情報です" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  // endpoint は @unique。同じ端末の再購読は upsert で更新（ユーザー付け替えも吸収）。
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

// 購読解除（endpoint 指定）。本人の購読のみ削除する。
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const endpoint =
    json && typeof json === "object" && typeof (json as { endpoint?: unknown }).endpoint === "string"
      ? (json as { endpoint: string }).endpoint
      : null;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint が必要です" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
