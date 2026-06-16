import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificationText, notificationUrl } from "@/lib/notifications";

// 通知一覧（ベルのドロップダウン／ブラウザ通知のポーリング用）。
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ items: [], unread: 0 });
  }
  const rows = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const items = rows.map((n) => {
    const { title, body } = notificationText(n);
    return {
      id: n.id,
      type: n.type,
      title,
      body,
      url: notificationUrl(n),
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    };
  });
  const unread = items.filter((i) => !i.read).length;
  return NextResponse.json({ items, unread });
}
