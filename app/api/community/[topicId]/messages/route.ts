import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMessagesAfter, getTipTotalsForVisible } from "@/lib/community";
import { touchPresence, getActiveViewers } from "@/lib/community/presence";

// トピックの新着メッセージ差分＋オンライン閲覧者を返す。閲覧は誰でも可。
// ログイン中はプレゼンスを更新し、after があればそれ以降の hidden=false を昇順で返す。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  const url = new URL(request.url);
  const afterRaw = url.searchParams.get("after");

  // ログイン中の閲覧者はプレゼンスを更新（表示名・アイコンを添えて記録）。
  const session = await auth();
  if (session?.user?.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true, avatarUrl: true },
    });
    touchPresence(topicId, {
      userId: session.user.id,
      displayName: me?.displayName ?? null,
      avatarUrl: me?.avatarUrl ?? null,
    });
  }

  let messages: Awaited<ReturnType<typeof getMessagesAfter>> = [];
  if (afterRaw) {
    const after = new Date(afterRaw);
    if (Number.isNaN(after.getTime())) {
      return NextResponse.json({ error: "after が不正です" }, { status: 400 });
    }
    messages = await getMessagesAfter(topicId, after);
  }

  const online = getActiveViewers(topicId).map((v) => ({
    id: v.userId,
    displayName: v.displayName,
    avatarUrl: v.avatarUrl,
  }));

  // 表示中メッセージへの投げ銭合計スナップショット（既存メッセージのtip増加を反映）。
  const tips = await getTipTotalsForVisible(topicId);

  return NextResponse.json({ messages, online, tips });
}
