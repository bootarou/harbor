import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPrefs,
  NOTIFICATION_TYPES,
  normalizePrefs,
} from "@/lib/notifications";

// 通知設定の取得。
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const prefs = await getPrefs(session.user.id);
  return NextResponse.json({ prefs, types: NOTIFICATION_TYPES });
}

// 通知設定の更新（既知キーのみ採用）。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const prefs = normalizePrefs(body?.prefs ?? body);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationPrefs: prefs },
  });
  return NextResponse.json({ ok: true, prefs });
}
