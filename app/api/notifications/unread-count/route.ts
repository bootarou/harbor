import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ヘッダーのバッジ用。最終確認時刻より後の「自分の記事への他者リアクション」と
// 「受け取った Thanks」の合計件数を返す。
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }
  const me = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: me },
    select: { notificationsReadAt: true },
  });
  const since = user?.notificationsReadAt ?? new Date(0);

  const [reactions, thanks] = await Promise.all([
    prisma.reaction.count({
      where: {
        post: { authorId: me },
        userId: { not: me },
        createdAt: { gt: since },
      },
    }),
    prisma.thanks.count({
      where: { receiverUserId: me, createdAt: { gt: since } },
    }),
  ]);

  return NextResponse.json({ count: reactions + thanks });
}
