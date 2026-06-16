import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 通知を既読にする。body.ids 指定があればそのIDのみ、無ければ全件。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
  } | null;

  const where = {
    userId: session.user.id,
    read: false,
    ...(Array.isArray(body?.ids) && body.ids.length > 0
      ? { id: { in: body.ids } }
      : {}),
  };
  const res = await prisma.notification.updateMany({ where, data: { read: true } });
  return NextResponse.json({ ok: true, updated: res.count });
}
