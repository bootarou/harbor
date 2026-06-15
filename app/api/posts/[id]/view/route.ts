import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 記事の閲覧数をインクリメントする。
// - 公開記事のみカウント
// - 著者本人の閲覧はカウントしない
// - 同一ブラウザの重複（リロード等）はクライアント側 localStorage で抑制
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { published: true, authorId: true },
  });
  if (!post || !post.published) {
    return new NextResponse(null, { status: 204 });
  }

  const session = await auth();
  if (session?.user?.id && session.user.id === post.authorId) {
    return new NextResponse(null, { status: 204 });
  }

  await prisma.post.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });
  return new NextResponse(null, { status: 204 });
}
