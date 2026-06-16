"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isReactionKey } from "@/lib/thanks";
import { notify } from "@/lib/notifications";

export type ReactionResult = { error?: string; active?: boolean };

// リアクションのトグル（要ログイン）。同一(記事・ユーザー・種別)が既にあれば取り消し、無ければ付与。
export async function toggleReaction(
  postId: string,
  type: string
): Promise<ReactionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "リアクションするにはログインしてください。" };
  }
  if (!isReactionKey(type)) {
    return { error: "リアクション種別が不正です" };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true, authorId: true, title: true },
  });
  if (!post || !post.published) {
    return { error: "記事が見つかりません" };
  }

  const existing = await prisma.reaction.findUnique({
    where: {
      postId_userId_type: { postId, userId: session.user.id, type },
    },
    select: { id: true },
  });

  let active: boolean;
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    active = false;
  } else {
    await prisma.reaction.create({
      data: { postId, userId: session.user.id, type },
    });
    active = true;
    // 著者へ通知（自分の記事への自分のリアクションは除く）。
    if (post.authorId !== session.user.id) {
      const me = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { displayName: true },
      });
      await notify({
        userId: post.authorId,
        type: "reaction",
        actorId: session.user.id,
        actorName: me?.displayName ?? null,
        postId,
        postTitle: post.title,
      });
    }
  }

  revalidatePath(`/posts/${postId}`);
  return { active };
}
