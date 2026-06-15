"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type BookmarkResult = { error?: string; bookmarked?: boolean };

// 記事のブックマークをトグルする（要ログイン）。既にあれば解除、無ければ追加。
export async function toggleBookmark(postId: string): Promise<BookmarkResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "ブックマークするにはログインしてください。" };
  }
  if (typeof postId !== "string" || !postId) {
    return { error: "対象が不正です" };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true },
  });
  if (!post || !post.published) {
    return { error: "記事が見つかりません" };
  }

  const existing = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId: session.user.id, postId } },
    select: { id: true },
  });

  let bookmarked: boolean;
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    bookmarked = false;
  } else {
    try {
      await prisma.bookmark.create({
        data: { userId: session.user.id, postId },
      });
    } catch (e) {
      // 競合（二重クリック等）は既に登録済みとして扱う。
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      ) {
        throw e;
      }
    }
    bookmarked = true;
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/bookmarks");
  return { bookmarked };
}
